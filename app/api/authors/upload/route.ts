import { NextRequest, NextResponse } from "next/server";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { queryRows, withTransaction } from "@/app/lib/server-postgres";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { authorFieldDictionary } from "@/app/lib/author-field-dictionaries";
import { splitEscapedPipe, splitEscapedPipeList, splitStructuredCsvEntries } from "@/app/lib/csv-pipe-utils";
import type { AuthorAliasEntry, AuthorMasterRecord } from "@/app/lib/types";

export const runtime = "nodejs";

type UploadMode = "preview" | "commit";
type UploadBody = { mode?: unknown; csvText?: unknown; fileName?: unknown; fileSizeBytes?: unknown };
type UploadFieldId = keyof typeof authorFieldDictionary;
type CsvSourceRow = { rowNumber: number; cells: Partial<Record<UploadFieldId, string>>; providedFields: Set<UploadFieldId> };
type AuthorAliasToken = { name: string; authorId: string };
type SocialLinkToken = { service: string; account: string; url: string; memo: string };
type ExistingAuthorRow = { internalId: string; id: string; name: string; reading: string };
type PlannedUploadRow = {
  rowNumber: number;
  action: "create" | "update";
  sourceId: string;
  targetId: string;
  title: string;
  status: "ready" | "error";
  messages: string[];
  draftRecord?: AuthorMasterRecord;
  existingRecord?: AuthorMasterRecord;
};
type UploadPlan = {
  fileName: string;
  headers: string[];
  rows: PlannedUploadRow[];
  totalRows: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  canCommit: boolean;
};
type AuthorAliasLinkSnapshot = Record<string, unknown>;
type UndoSnapshotEntry = {
  action: "create" | "update";
  id: string;
  internalId: string;
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
  beforeAliases: AuthorAliasLinkSnapshot[];
  afterAliases: AuthorAliasLinkSnapshot[];
};
type UploadUndoPayload = { authors: UndoSnapshotEntry[] };

class UploadValidationError extends Error {}

const MAX_CSV_UPLOAD_FILE_SIZE_BYTES = 4 * 1024 * 1024;

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;
const sqlAuthUserRef = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "null";
  return `${sqlString(normalized)}::uuid`;
};
const sqlTextArray = (values: string[]) => `array[${values.map(sqlString).join(", ")}]::text[]`;

const parseJson = <T,>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseJsonObject = (value: string | null | undefined) => {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
};

const normalizeRequiredText = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new UploadValidationError(`${label}は必須です`);
  return normalized;
};

const normalizeHiraganaReading = (value: string, label: string) => {
  const normalized = normalizeRequiredText(value, label);
  if (!/^[ぁ-ゖー]+$/.test(normalized)) {
    throw new UploadValidationError(`${label}はひらがなと長音「ー」のみで入力してください`);
  }
  return normalized;
};

const parseCsvText = (csvText: string) => {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && csvText[i + 1] === "\n") i += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  if (inQuotes) throw new UploadValidationError("CSVのダブルクォートが閉じられていません");
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
};

const publicFieldEntries = Object.entries(authorFieldDictionary).filter(
  ([, entry]) => entry.visibility === "public",
) as Array<[UploadFieldId, (typeof authorFieldDictionary)[UploadFieldId]]>;
const headerLabelToFieldId = new Map(publicFieldEntries.map(([fieldId, entry]) => [entry.labelJa, fieldId]));

const parseCsvRows = (csvText: string) => {
  const parsed = parseCsvText(csvText);
  if (parsed.length === 0) throw new UploadValidationError("CSVにデータがありません");
  const [headerRow, ...valueRows] = parsed;
  if (headerRow.length === 0) throw new UploadValidationError("CSVヘッダーを読み取れません");
  const normalizedHeaders = headerRow.map((header) => header.trim());
  const duplicateHeaders = normalizedHeaders.filter((header, index) => normalizedHeaders.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) throw new UploadValidationError(`CSVヘッダーが重複しています: ${Array.from(new Set(duplicateHeaders)).join(", ")}`);
  const unknownHeaders = normalizedHeaders.filter((header) => !headerLabelToFieldId.has(header));
  if (unknownHeaders.length > 0) throw new UploadValidationError(`未対応のCSVヘッダーがあります: ${unknownHeaders.join(", ")}`);
  const fieldIds = normalizedHeaders.map((header) => headerLabelToFieldId.get(header) as UploadFieldId);
  if (!fieldIds.includes("id")) throw new UploadValidationError("CSVヘッダーにID列が必要です");
  const rows = valueRows.map((valueRow, rowIndex) => {
    const cells: Partial<Record<UploadFieldId, string>> = {};
    const providedFields = new Set<UploadFieldId>();
    fieldIds.forEach((fieldId, columnIndex) => {
      const value = String(valueRow[columnIndex] ?? "");
      cells[fieldId] = value;
      if (value.trim()) providedFields.add(fieldId);
    });
    return { rowNumber: rowIndex + 2, cells, providedFields };
  });
  if (rows.length === 0) throw new UploadValidationError("CSVに明細行がありません");
  return { headers: normalizedHeaders, rows };
};

const authorSelect = `
  a.id,
  a.author_id,
  a.author_name,
  a.author_reading,
  a.social_links::text as social_links_json,
  a.memo,
  to_jsonb(a.tags)::text as tags_json,
  a.search_text,
  coalesce(a.updated_at::text, '') as updated_at,
  coalesce(alias_links.aliases_json, '[]'::jsonb)::text as aliases_json`;

const authorFromClause = `
from public.authors a
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'name', alias_author.author_name,
      'author_key', alias_author.id,
      'author_id', alias_author.author_id
    )
    order by alias_author.author_reading, alias_author.author_name, alias_author.author_id
  ) as aliases_json
  from public.author_alias_links link
  join public.authors alias_author
    on alias_author.id = case
      when link.author_key_1 = a.id then link.author_key_2
      else link.author_key_1
    end
  where (link.author_key_1 = a.id or link.author_key_2 = a.id)
    and alias_author.record_status = 'published'
) alias_links on true`;

const rowToAuthorRecord = (row: Record<string, string | null>): AuthorMasterRecord => ({
  id: row.author_id ?? "",
  internalId: row.id ?? "",
  name: row.author_name ?? "",
  reading: row.author_reading ?? "",
  otherAuthorIds: row.aliases_json ?? "[]",
  socialLinks: row.social_links_json ?? "[]",
  memo: row.memo ?? "",
  tag: parseJson<string[]>(row.tags_json, []),
  searchText: row.search_text ?? "",
  updatedAt: row.updated_at ?? "",
});

const loadAuthorRecordsByIds = async (ids: string[]) => {
  if (ids.length === 0) return new Map<string, AuthorMasterRecord>();
  const rows = await queryRows(`
select
${authorSelect}
${authorFromClause}
where a.record_status = 'published'
  and a.author_id in (${ids.map(sqlString).join(", ")});
`);
  return new Map(rows.map((row) => [row.author_id ?? "", rowToAuthorRecord(row)]));
};

const loadExistingAuthors = async () => {
  const rows = await queryRows(`
select
  a.id,
  a.author_id,
  a.author_name,
  a.author_reading
from public.authors a
where a.record_status = 'published'
order by a.author_reading, a.author_name, a.author_id;
`);
  const normalized = rows.map((row) => ({
    internalId: row.id ?? "",
    id: row.author_id ?? "",
    name: row.author_name ?? "",
    reading: row.author_reading ?? "",
  }));
  return {
    byId: new Map(normalized.map((row) => [row.id, row])),
    byName: normalized.reduce<Map<string, ExistingAuthorRow[]>>((map, row) => {
      const current = map.get(row.name) ?? [];
      current.push(row);
      map.set(row.name, current);
      return map;
    }, new Map()),
  };
};

const parseAliasTokens = (value: string) =>
  splitStructuredCsvEntries(value)
    .map((part) => {
      const pieces = splitEscapedPipe(part);
      const nonEmptyPieces = pieces.filter(Boolean);
      if (nonEmptyPieces.length === 0) return null;
      if (nonEmptyPieces.length === 1) {
        return /^A[0-9]+$/.test(nonEmptyPieces[0])
          ? { name: "", authorId: nonEmptyPieces[0] }
          : { name: nonEmptyPieces[0], authorId: "" };
      }
      return { name: nonEmptyPieces[0], authorId: /^A[0-9]+$/.test(nonEmptyPieces[1]) ? nonEmptyPieces[1] : "" };
    })
    .filter(Boolean) as AuthorAliasToken[];

const parseSocialLinkTokens = (value: string) =>
  splitStructuredCsvEntries(value)
    .map((part) => {
      const pieces = splitEscapedPipe(part);
      const [service = "", account = "", url = "", memo = ""] = pieces;
      if (!service && !account && !url && !memo) return null;
      return { service, account, url, memo };
    })
    .filter(Boolean) as SocialLinkToken[];

const resolveAliases = (
  tokens: AuthorAliasToken[],
  lookup: Awaited<ReturnType<typeof loadExistingAuthors>>,
  selfId?: string,
) => {
  const resolved: AuthorAliasEntry[] = [];
  const seenIds = new Set<string>();
  for (const token of tokens) {
    const name = token.name.trim();
    const authorId = token.authorId.trim();
    let matched: ExistingAuthorRow | null = null;
    if (authorId) {
      matched = lookup.byId.get(authorId) ?? null;
      if (!matched) throw new UploadValidationError(`別名義の著者IDが見つかりません: ${authorId}`);
    } else if (name) {
      const byName = lookup.byName.get(name) ?? [];
      if (byName.length === 0) throw new UploadValidationError(`別名義の著者が見つかりません: ${name}`);
      if (byName.length > 1) throw new UploadValidationError(`同名の著者が複数あるため別名義を特定できません: ${name}`);
      matched = byName[0];
    }
    const resolvedId = matched?.id ?? authorId;
    if (!resolvedId) continue;
    if (selfId && resolvedId === selfId) throw new UploadValidationError("自分自身は別名義に追加できません");
    if (seenIds.has(resolvedId)) continue;
    seenIds.add(resolvedId);
    resolved.push({
      name: matched?.name ?? name,
      author_id: resolvedId,
      author_key: matched?.internalId ?? "",
    });
  }
  return resolved;
};

const buildSearchText = (name: string, reading: string) => [name, reading, name].filter(Boolean).join(" ").slice(0, 1000);

const buildDraftRecord = (
  action: "create" | "update",
  sourceRow: CsvSourceRow,
  existingRecord: AuthorMasterRecord | undefined,
  lookup: Awaited<ReturnType<typeof loadExistingAuthors>>,
) => {
  const getValue = (fieldId: UploadFieldId) => String(sourceRow.cells[fieldId] ?? "");
  const hasField = (fieldId: UploadFieldId) => sourceRow.providedFields.has(fieldId);
  const current =
    existingRecord ??
    ({
      id: "",
      internalId: "",
      name: "",
      reading: "",
      otherAuthorIds: "[]",
      socialLinks: "[]",
      memo: "",
      tag: [],
      searchText: "",
      updatedAt: "",
    } satisfies AuthorMasterRecord);

  const name = action === "create" || hasField("name") ? normalizeRequiredText(getValue("name"), "名前") : current.name;
  const reading = action === "create" || hasField("reading") ? normalizeHiraganaReading(getValue("reading"), "読み") : current.reading;
  const selfId = action === "update" ? current.id : undefined;
  const otherAuthorIds = hasField("otherAuthorIds")
    ? JSON.stringify(resolveAliases(parseAliasTokens(getValue("otherAuthorIds")), lookup, selfId))
    : current.otherAuthorIds;
  const socialLinks = hasField("socialLinks") ? JSON.stringify(parseSocialLinkTokens(getValue("socialLinks"))) : current.socialLinks;
  const memo = hasField("memo") ? getValue("memo").trim() : current.memo;
  const tag = hasField("tag") ? splitEscapedPipeList(getValue("tag")) : current.tag;
  return {
    ...current,
    name,
    reading,
    otherAuthorIds,
    socialLinks,
    memo,
    tag,
  } satisfies AuthorMasterRecord;
};

const buildUploadPlan = async (csvText: string, fileName: string): Promise<UploadPlan> => {
  const parsed = parseCsvRows(csvText);
  const updateIds = Array.from(new Set(parsed.rows.map((row) => String(row.cells.id ?? "").trim()).filter(Boolean)));
  const [existingAuthorsById, authorLookup] = await Promise.all([loadAuthorRecordsByIds(updateIds), loadExistingAuthors()]);
  const seenCreateNames = new Set<string>();
  const seenUpdateIds = new Set<string>();
  const rows = parsed.rows.map((sourceRow) => {
    const sourceId = String(sourceRow.cells.id ?? "").trim();
    const action = sourceId ? "update" : "create";
    const errorMessages: string[] = [];
    let existingRecord: AuthorMasterRecord | undefined;
    let draftRecord: AuthorMasterRecord | undefined;
    try {
      if (action === "update") {
        if (seenUpdateIds.has(sourceId)) throw new UploadValidationError(`同じIDがCSV内で重複しています: ${sourceId}`);
        seenUpdateIds.add(sourceId);
        existingRecord = existingAuthorsById.get(sourceId);
        if (!existingRecord) throw new UploadValidationError(`更新対象の著者が見つかりません: ${sourceId}`);
      } else {
        const name = String(sourceRow.cells.name ?? "").trim();
        if (!name) throw new UploadValidationError("新規追加では名前が必須です");
        if (seenCreateNames.has(name)) throw new UploadValidationError(`同じ名前の新規行がCSV内で重複しています: ${name}`);
        if ((authorLookup.byName.get(name) ?? []).length > 0) throw new UploadValidationError(`同じ著者名のマスターが存在します: ${name}`);
        seenCreateNames.add(name);
      }
      draftRecord = buildDraftRecord(action, sourceRow, existingRecord, authorLookup);
    } catch (error) {
      errorMessages.push(error instanceof Error ? error.message : "行の検証に失敗しました");
    }
    const status = errorMessages.length > 0 ? "error" : "ready";
    return {
      rowNumber: sourceRow.rowNumber,
      action,
      sourceId,
      targetId: action === "update" ? sourceId : "",
      title: draftRecord?.name ?? String(sourceRow.cells.name ?? "").trim(),
      status,
      messages: status === "error" ? errorMessages : ["取り込み可能です"],
      draftRecord,
      existingRecord,
    } satisfies PlannedUploadRow;
  });
  const errorCount = rows.filter((row) => row.status === "error").length;
  return {
    fileName,
    headers: parsed.headers,
    rows,
    totalRows: rows.length,
    createCount: rows.filter((row) => row.action === "create").length,
    updateCount: rows.filter((row) => row.action === "update").length,
    errorCount,
    canCommit: rows.length > 0 && errorCount === 0,
  };
};

const getNextSequentialNumber = async () => {
  const rows = await queryRows(`
select coalesce(max(substring(author_id from 2)::integer), 0) as current_no
from public.authors
where author_id ~ '^A[0-9]+$';
`);
  return Number(rows[0]?.current_no ?? 0);
};

const loadRawAuthorSnapshotByInternalId = async (internalId: string) => {
  const rows = await queryRows(`
select to_jsonb(a)::text as row_json
from public.authors a
where a.id = ${sqlString(internalId)}
limit 1;
`);
  return parseJsonObject(rows[0]?.row_json);
};

const loadAliasSnapshots = async (authorId: string, internalId: string) => {
  const rows = await queryRows(`
select to_jsonb(link)::text as row_json
from public.author_alias_links link
where link.author_id_1 = ${sqlString(authorId)}
   or link.author_id_2 = ${sqlString(authorId)}
   or link.author_key_1 = ${sqlString(internalId)}
   or link.author_key_2 = ${sqlString(internalId)}
order by link.author_id_1, link.author_id_2;
`);
  return rows.map((row) => parseJsonObject(row.row_json)).filter((row) => Object.keys(row).length > 0);
};

const insertUploadUndoLog = async ({
  currentUserId,
  fileName,
  importedCount,
  createCount,
  updateCount,
  payload,
}: {
  currentUserId: string;
  fileName: string;
  importedCount: number;
  createCount: number;
  updateCount: number;
  payload: UploadUndoPayload;
}) => {
  const uploadId = createInternalId("ul");
  await queryRows(`
update public.user_logs
set undone_at = now()
where user_id = ${sqlString(currentUserId)}::uuid
  and log_type = 'undo_action'
  and target_type = 'author_csv_upload'
  and undone_at is null;
`);
  await queryRows(`
insert into public.user_logs (
  user_id, actor_user_id, log_type, target_type, target_id, metadata, before_data, after_data, note
) values (
  ${sqlString(currentUserId)}::uuid,
  ${sqlString(currentUserId)}::uuid,
  'undo_action',
  'author_csv_upload',
  ${sqlString(uploadId)},
  ${sqlJson({ kind: "author_csv_upload", label: "Undo Upload", fileName, importedCount, createCount, updateCount })},
  ${sqlJson(payload)},
  ${sqlJson({ fileName, importedCount, createCount, updateCount })},
  'csv_upload'
);
`);
};

const pairAliasIds = (authorId: string, aliasId: string) => {
  if (authorId === aliasId) throw new UploadValidationError("自分自身は別名義に追加できません");
  return authorId < aliasId ? [authorId, aliasId] : [aliasId, authorId];
};

const saveAuthorAliases = async (authorId: string, internalId: string, aliases: AuthorAliasEntry[]) => {
  const aliasIds = Array.from(new Set(aliases.map((alias) => alias.author_id).filter(Boolean)));
  await queryRows(`
delete from public.author_alias_links
where author_id_1 = ${sqlString(authorId)}
   or author_id_2 = ${sqlString(authorId)}
   or author_key_1 = ${sqlString(internalId)}
   or author_key_2 = ${sqlString(internalId)};
`);
  if (aliasIds.length === 0) return;
  const existingRows = await queryRows(`
select author_id, id
from public.authors
where record_status = 'published'
  and author_id in (${[authorId, ...aliasIds].map(sqlString).join(", ")});
`);
  const existingIds = new Set(existingRows.map((row) => row.author_id ?? ""));
  const authorKeyById = new Map(existingRows.map((row) => [row.author_id ?? "", row.id ?? ""]));
  const missingIds = aliasIds.filter((aliasId) => !existingIds.has(aliasId));
  if (missingIds.length > 0) {
    throw new UploadValidationError(`存在しない著者IDは別名義に追加できません: ${missingIds.join(", ")}`);
  }
  const pairs = Array.from(
    new Set(
      aliasIds.map((aliasId) => {
        const [leftId, rightId] = pairAliasIds(authorId, aliasId);
        const aliasKey = authorKeyById.get(aliasId) ?? "";
        if (!aliasKey) throw new UploadValidationError(`著者内部キーを取得できませんでした: ${aliasId}`);
        const [leftKey, rightKey] = internalId < aliasKey ? [internalId, aliasKey] : [aliasKey, internalId];
        return JSON.stringify({ leftId, rightId, leftKey, rightKey });
      }),
    ),
  ).map((pair) => JSON.parse(pair) as { leftId: string; rightId: string; leftKey: string; rightKey: string });
  await queryRows(`
insert into public.author_alias_links (
  author_id_1,
  author_id_2,
  author_key_1,
  author_key_2,
  relation_kind
) values
${pairs.map((pair) => `(${sqlString(pair.leftId)}, ${sqlString(pair.rightId)}, ${sqlString(pair.leftKey)}, ${sqlString(pair.rightKey)}, 'alias')`).join(",\n")}
on conflict (author_id_1, author_id_2) do nothing;
`);
};

const insertAuthorRecord = async (record: AuthorMasterRecord, nextNo: number, currentUserId: string) => {
  const authorId = `A${String(nextNo).padStart(6, "0")}`;
  const authorKey = createInternalId("au");
  const searchText = buildSearchText(record.name, record.reading);
  await queryRows(`
insert into public.authors (
  id, author_id, author_name, author_reading, social_links, memo, tags, search_text,
  record_status, owner_user_id, created_by, updated_by, approved_by, approved_at
) values (
  ${sqlString(authorKey)},
  ${sqlString(authorId)},
  ${sqlString(record.name)},
  ${sqlString(record.reading)},
  ${sqlJson(parseJson(record.socialLinks, []))},
  ${sqlString(record.memo)},
  ${sqlTextArray(record.tag)},
  ${sqlString(searchText)},
  'published',
  ${sqlAuthUserRef(currentUserId)},
  ${sqlAuthUserRef(currentUserId)},
  ${sqlAuthUserRef(currentUserId)},
  ${sqlAuthUserRef(currentUserId)},
  now()
);
`);
  await saveAuthorAliases(authorId, authorKey, parseJson<AuthorAliasEntry[]>(record.otherAuthorIds, []));
  return { authorId, authorKey };
};

const updateAuthorRecord = async (record: AuthorMasterRecord, currentUserId: string) => {
  const searchText = buildSearchText(record.name, record.reading);
  await queryRows(`
update public.authors
set
  author_name = ${sqlString(record.name)},
  author_reading = ${sqlString(record.reading)},
  social_links = ${sqlJson(parseJson(record.socialLinks, []))},
  memo = ${sqlString(record.memo)},
  tags = ${sqlTextArray(record.tag)},
  search_text = ${sqlString(searchText)},
  updated_by = ${sqlAuthUserRef(currentUserId)}
where id = ${sqlString(record.internalId ?? "")}
  and record_status = 'published';
`);
  await saveAuthorAliases(record.id, record.internalId ?? "", parseJson<AuthorAliasEntry[]>(record.otherAuthorIds, []));
};

const persistUploadPlan = async (plan: UploadPlan, currentUserId: string) => {
  let nextAuthorNo = (await getNextSequentialNumber()) + 1;
  const undoPayload: UploadUndoPayload = { authors: [] };
  const affectedAuthorIds: string[] = [];
  for (const row of plan.rows) {
    if (!row.draftRecord) throw new UploadValidationError(`行 ${row.rowNumber} のデータが不足しています`);
    if (row.action === "create") {
      const created = await insertAuthorRecord(row.draftRecord, nextAuthorNo, currentUserId);
      const afterSnapshot = await loadRawAuthorSnapshotByInternalId(created.authorKey);
      const afterAliases = await loadAliasSnapshots(created.authorId, created.authorKey);
      undoPayload.authors.push({
        action: "create",
        id: created.authorId,
        internalId: created.authorKey,
        beforeRow: null,
        afterRow: afterSnapshot,
        beforeAliases: [],
        afterAliases,
      });
      affectedAuthorIds.push(created.authorId);
      nextAuthorNo += 1;
      continue;
    }
    const updateRecord = {
      ...row.draftRecord,
      id: row.existingRecord?.id ?? row.draftRecord.id,
      internalId: row.existingRecord?.internalId ?? row.draftRecord.internalId,
    };
    const beforeSnapshot = await loadRawAuthorSnapshotByInternalId(updateRecord.internalId ?? "");
    const beforeAliases = await loadAliasSnapshots(updateRecord.id, updateRecord.internalId ?? "");
    await updateAuthorRecord(updateRecord, currentUserId);
    const afterSnapshot = await loadRawAuthorSnapshotByInternalId(updateRecord.internalId ?? "");
    const afterAliases = await loadAliasSnapshots(updateRecord.id, updateRecord.internalId ?? "");
    undoPayload.authors.push({
      action: "update",
      id: updateRecord.id,
      internalId: updateRecord.internalId ?? "",
      beforeRow: beforeSnapshot,
      afterRow: afterSnapshot,
      beforeAliases,
      afterAliases,
    });
    affectedAuthorIds.push(updateRecord.id);
  }
  await insertUploadUndoLog({
    currentUserId,
    fileName: plan.fileName,
    importedCount: affectedAuthorIds.length,
    createCount: plan.createCount,
    updateCount: plan.updateCount,
    payload: undoPayload,
  });
  return affectedAuthorIds;
};

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    if (currentUser.role !== "super_admin") {
      return NextResponse.json({ error: "CSVアップロードは現在、超管理者のみ利用できます" }, { status: 403 });
    }
    const body = (await request.json()) as UploadBody;
    const mode = String(body.mode ?? "").trim() as UploadMode;
    const csvText = String(body.csvText ?? "");
    const fileName = String(body.fileName ?? "author_masters.csv");
    const fileSizeBytes = Number(body.fileSizeBytes ?? Buffer.byteLength(csvText, "utf8"));
    if (mode !== "preview" && mode !== "commit") return NextResponse.json({ error: "mode is required" }, { status: 400 });
    if (!csvText.trim()) return NextResponse.json({ error: "csvText is required" }, { status: 400 });
    if (!Number.isFinite(fileSizeBytes) || fileSizeBytes > MAX_CSV_UPLOAD_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "4MBを超えるためアップロードできません。4MB以下のCSVを選択してください。" }, { status: 400 });
    }
    const plan = await buildUploadPlan(csvText, fileName);
    if (mode === "preview") return NextResponse.json(plan);
    if (!plan.canCommit) return NextResponse.json({ ...plan, error: "エラーがあるため取り込めません" }, { status: 400 });
    const affectedAuthorIds = await withTransaction(async () => persistUploadPlan(plan, currentUser.id));
    return NextResponse.json({ ...plan, affectedAuthorIds, importedCount: affectedAuthorIds.length });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }
    return createRouteErrorResponse(error, "CSVアップロードに失敗しました", {
      databaseMessage: "データベースに接続できないため著者CSVを取り込めません。",
    });
  }
}
