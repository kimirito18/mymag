import { NextRequest, NextResponse } from "next/server";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { queryRows, withTransaction } from "@/app/lib/server-postgres";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { publisherFieldDictionary } from "@/app/lib/publisher-field-dictionaries";
import { splitEscapedPipeList, splitEscapedPipe, splitStructuredCsvEntries } from "@/app/lib/csv-pipe-utils";
import type { PublisherMasterRecord } from "@/app/lib/types";

export const runtime = "nodejs";

type UploadMode = "preview" | "commit";
type UploadBody = { mode?: unknown; csvText?: unknown; fileName?: unknown; fileSizeBytes?: unknown };
type UploadFieldId = keyof typeof publisherFieldDictionary;
type CsvSourceRow = { rowNumber: number; cells: Partial<Record<UploadFieldId, string>>; providedFields: Set<UploadFieldId> };
type RelatedPublisherToken = { role: string; name: string; publisherId: string };
type RelatedLinkToken = { role: string; url: string; memo: string };
type ExistingPublisherRow = { internalId: string; id: string; name: string; reading: string };
type PlannedRelatedPublisher = { role: string; name: string; publisherId: string; publisherKey?: string };
type PlannedUploadRow = {
  rowNumber: number;
  action: "create" | "update";
  sourceId: string;
  targetId: string;
  title: string;
  status: "ready" | "error";
  messages: string[];
  draftRecord?: PublisherMasterRecord;
  existingRecord?: PublisherMasterRecord;
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
type UndoSnapshotEntry = { action: "create" | "update"; id: string; internalId: string; beforeRow: Record<string, unknown> | null; afterRow: Record<string, unknown> | null };
type UploadUndoPayload = { publishers: UndoSnapshotEntry[] };

class UploadValidationError extends Error {}

const MAX_CSV_UPLOAD_FILE_SIZE_BYTES = 4 * 1024 * 1024;

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;
const sqlAuthUserRef = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "null";
  return `${sqlString(normalized)}::uuid`;
};
const sqlNullableDate = (value: string | null) => (value == null ? "null" : `${sqlString(value)}::date`);
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

const normalizeDate = (value: string, label: string) => {
  const text = value.trim();
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new UploadValidationError(`${label}はYYYY-MM-DDで入力してください`);
  return text;
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
      } else inQuotes = !inQuotes;
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

const publicFieldEntries = Object.entries(publisherFieldDictionary).filter(
  ([, entry]) => entry.visibility === "public",
) as Array<[UploadFieldId, (typeof publisherFieldDictionary)[UploadFieldId]]>;
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

const loadPublisherRecordsByIds = async (ids: string[]) => {
  if (ids.length === 0) return new Map<string, PublisherMasterRecord>();
  const rows = await queryRows(`
select
  p.id,
  p.publisher_id,
  p.publisher_name,
  p.publisher_reading,
  p.address,
  p.url,
  p.related_link::text as related_link_json,
  coalesce(p.start_date::text, '') as start_date,
  coalesce(p.end_date::text, '') as end_date,
  p.memo,
  p.related_publishers::text as related_publishers_json,
  to_jsonb(p.tags)::text as tags_json,
  p.search_text,
  coalesce(p.updated_at::text, '') as updated_at
from public.publishers p
where p.record_status = 'published'
  and p.publisher_id in (${ids.map(sqlString).join(", ")});
`);
  return new Map(rows.map((row) => [row.publisher_id ?? "", rowToPublisherRecord(row)]));
};

const loadExistingPublishers = async () => {
  const rows = await queryRows(`
select
  p.id,
  p.publisher_id,
  p.publisher_name,
  p.publisher_reading
from public.publishers p
where p.record_status = 'published'
order by p.publisher_name, p.publisher_id;
`);
  const normalized = rows.map((row) => ({
    internalId: row.id ?? "",
    id: row.publisher_id ?? "",
    name: row.publisher_name ?? "",
    reading: row.publisher_reading ?? "",
  }));
  return {
    byId: new Map(normalized.map((row) => [row.id, row])),
    byName: normalized.reduce<Map<string, ExistingPublisherRow[]>>((map, row) => {
      const current = map.get(row.name) ?? [];
      current.push(row);
      map.set(row.name, current);
      return map;
    }, new Map()),
    byReading: normalized.reduce<Map<string, ExistingPublisherRow[]>>((map, row) => {
      const current = map.get(row.reading) ?? [];
      current.push(row);
      map.set(row.reading, current);
      return map;
    }, new Map()),
  };
};

const parseRelatedPublisherTokens = (value: string) =>
  splitStructuredCsvEntries(value)
    .map((part) => {
      const pieces = splitEscapedPipe(part);
      const nonEmptyPieces = pieces.filter(Boolean);
      if (nonEmptyPieces.length === 0) return null;
      if (nonEmptyPieces.length === 1) return { role: "", name: nonEmptyPieces[0], publisherId: "" };
      if (nonEmptyPieces.length === 2) {
        return /^P[0-9]+$/.test(nonEmptyPieces[1])
          ? { role: "", name: nonEmptyPieces[0], publisherId: nonEmptyPieces[1] }
          : { role: nonEmptyPieces[0], name: nonEmptyPieces[1], publisherId: "" };
      }
      const last = nonEmptyPieces[2] ?? "";
      return { role: nonEmptyPieces[0], name: nonEmptyPieces[1], publisherId: /^P[0-9]+$/.test(last) ? last : "" };
    })
    .filter(Boolean) as RelatedPublisherToken[];

const parseRelatedLinkTokens = (value: string) =>
  splitStructuredCsvEntries(value)
    .map((part) => {
      const pieces = splitEscapedPipe(part);
      const [role = "", url = "", memo = ""] = pieces;
      if (!role && !url && !memo) return null;
      return { role, url, memo };
    })
    .filter(Boolean) as RelatedLinkToken[];

const resolveRelatedPublishers = (
  tokens: RelatedPublisherToken[],
  lookup: Awaited<ReturnType<typeof loadExistingPublishers>>,
) =>
  tokens.map((token) => {
    const name = token.name.trim();
    const publisherId = token.publisherId.trim();
    let matched: ExistingPublisherRow | null = null;
    if (publisherId) matched = lookup.byId.get(publisherId) ?? null;
    if (!matched && name) {
      const byName = lookup.byName.get(name) ?? [];
      if (byName.length === 1) matched = byName[0];
    }
    return {
      role: token.role.trim(),
      name: name || matched?.name || "",
      publisher_id: matched?.id ?? publisherId,
      publisher_key: matched?.internalId ?? "",
    };
  });

const rowToPublisherRecord = (row: Record<string, string | null>): PublisherMasterRecord => ({
  id: row.publisher_id ?? "",
  internalId: row.id ?? "",
  name: row.publisher_name ?? "",
  reading: row.publisher_reading ?? "",
  address: row.address ?? "",
  url: row.url ?? "",
  relatedLink: row.related_link_json ?? "[]",
  startDate: row.start_date ?? "",
  endDate: row.end_date ?? "",
  memo: row.memo ?? "",
  relatedPublishers: row.related_publishers_json ?? "[]",
  tag: parseJson<string[]>(row.tags_json, []),
  searchText: row.search_text ?? "",
  updatedAt: row.updated_at ?? "",
});

const buildDraftRecord = (
  action: "create" | "update",
  sourceRow: CsvSourceRow,
  existingRecord: PublisherMasterRecord | undefined,
  lookup: Awaited<ReturnType<typeof loadExistingPublishers>>,
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
      address: "",
      url: "",
      relatedLink: "[]",
      startDate: "",
      endDate: "",
      memo: "",
      relatedPublishers: "[]",
      tag: [],
      searchText: "",
      updatedAt: "",
    } satisfies PublisherMasterRecord);

  const name = action === "create" || hasField("name") ? normalizeRequiredText(getValue("name"), "名前") : current.name;
  const reading = action === "create" || hasField("reading") ? normalizeRequiredText(getValue("reading"), "読み") : current.reading;
  const address = hasField("address") ? getValue("address").trim() : current.address;
  const url = hasField("url") ? getValue("url").trim() : current.url;
  const startDate = hasField("startDate") ? normalizeDate(getValue("startDate"), "設立日") : current.startDate;
  const endDate = hasField("endDate") ? normalizeDate(getValue("endDate"), "終了日") : current.endDate;
  const memo = hasField("memo") ? getValue("memo").trim() : current.memo;
  const tag = hasField("tag") ? splitEscapedPipeList(getValue("tag")) : current.tag;
  const relatedPublishers = hasField("relatedPublishers")
    ? JSON.stringify(resolveRelatedPublishers(parseRelatedPublisherTokens(getValue("relatedPublishers")), lookup))
    : current.relatedPublishers;
  const relatedLink = hasField("relatedLink")
    ? JSON.stringify(parseRelatedLinkTokens(getValue("relatedLink")))
    : current.relatedLink;
  return {
    ...current,
    name,
    reading,
    address,
    url,
    relatedLink,
    startDate,
    endDate,
    memo,
    relatedPublishers,
    tag,
  } satisfies PublisherMasterRecord;
};

const buildUploadPlan = async (csvText: string, fileName: string): Promise<UploadPlan> => {
  const parsed = parseCsvRows(csvText);
  const updateIds = Array.from(new Set(parsed.rows.map((row) => String(row.cells.id ?? "").trim()).filter(Boolean)));
  const [existingPublishersById, publisherLookup] = await Promise.all([loadPublisherRecordsByIds(updateIds), loadExistingPublishers()]);
  const seenCreateNames = new Set<string>();
  const seenUpdateIds = new Set<string>();
  const rows = parsed.rows.map((sourceRow) => {
    const sourceId = String(sourceRow.cells.id ?? "").trim();
    const action = sourceId ? "update" : "create";
    const readyMessages: string[] = [];
    const errorMessages: string[] = [];
    let existingRecord: PublisherMasterRecord | undefined;
    let draftRecord: PublisherMasterRecord | undefined;
    try {
      if (action === "update") {
        if (seenUpdateIds.has(sourceId)) throw new UploadValidationError(`同じIDがCSV内で重複しています: ${sourceId}`);
        seenUpdateIds.add(sourceId);
        existingRecord = existingPublishersById.get(sourceId);
        if (!existingRecord) throw new UploadValidationError(`更新対象の出版社が見つかりません: ${sourceId}`);
      } else {
        const name = String(sourceRow.cells.name ?? "").trim();
        if (!name) throw new UploadValidationError("新規追加では名前が必須です");
        if (seenCreateNames.has(name)) throw new UploadValidationError(`同じ名前の新規行がCSV内で重複しています: ${name}`);
        seenCreateNames.add(name);
      }
      draftRecord = buildDraftRecord(action, sourceRow, existingRecord, publisherLookup);
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
      messages: status === "error" ? errorMessages : readyMessages.length > 0 ? readyMessages : ["取り込み可能です"],
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
select coalesce(max(substring(publisher_id from 2)::integer), 0) as current_no
from public.publishers
where publisher_id ~ '^P[0-9]+$';
`);
  return Number(rows[0]?.current_no ?? 0);
};

const loadRawPublisherSnapshotByInternalId = async (internalId: string) => {
  const rows = await queryRows(`
select to_jsonb(p)::text as row_json
from public.publishers p
where p.id = ${sqlString(internalId)}
limit 1;
`);
  return parseJsonObject(rows[0]?.row_json);
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
  and target_type = 'publisher_csv_upload'
  and undone_at is null;
`);
  await queryRows(`
insert into public.user_logs (
  user_id, actor_user_id, log_type, target_type, target_id, metadata, before_data, after_data, note
) values (
  ${sqlString(currentUserId)}::uuid,
  ${sqlString(currentUserId)}::uuid,
  'undo_action',
  'publisher_csv_upload',
  ${sqlString(uploadId)},
  ${sqlJson({ kind: "publisher_csv_upload", label: "Undo Upload", fileName, importedCount, createCount, updateCount })},
  ${sqlJson(payload)},
  ${sqlJson({ fileName, importedCount, createCount, updateCount })},
  'csv_upload'
);
`);
};

const insertPublisherRecord = async (record: PublisherMasterRecord, nextNo: number, currentUserId: string) => {
  const publisherId = `P${String(nextNo).padStart(6, "0")}`;
  const publisherKey = createInternalId("pu");
  const searchText = [record.name, record.reading].filter(Boolean).join(" ").slice(0, 1000);
  await queryRows(`
insert into public.publishers (
  id, publisher_id, publisher_name, publisher_reading, address, url, related_link, start_date, end_date,
  memo, related_publishers, tags, search_text, record_status, owner_user_id, created_by, updated_by, approved_by, approved_at
) values (
  ${sqlString(publisherKey)},
  ${sqlString(publisherId)},
  ${sqlString(record.name)},
  ${sqlString(record.reading)},
  ${sqlString(record.address)},
  ${sqlString(record.url)},
  ${sqlJson(parseJson(record.relatedLink, []))},
  ${sqlNullableDate(record.startDate || null)},
  ${sqlNullableDate(record.endDate || null)},
  ${sqlString(record.memo)},
  ${sqlJson(parseJson(record.relatedPublishers, []))},
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
  return { publisherId, publisherKey };
};

const updatePublisherRecord = async (record: PublisherMasterRecord, currentUserId: string) => {
  const searchText = [record.name, record.reading].filter(Boolean).join(" ").slice(0, 1000);
  await queryRows(`
update public.publishers
set
  publisher_name = ${sqlString(record.name)},
  publisher_reading = ${sqlString(record.reading)},
  address = ${sqlString(record.address)},
  url = ${sqlString(record.url)},
  related_link = ${sqlJson(parseJson(record.relatedLink, []))},
  start_date = ${sqlNullableDate(record.startDate || null)},
  end_date = ${sqlNullableDate(record.endDate || null)},
  memo = ${sqlString(record.memo)},
  related_publishers = ${sqlJson(parseJson(record.relatedPublishers, []))},
  tags = ${sqlTextArray(record.tag)},
  search_text = ${sqlString(searchText)},
  updated_by = ${sqlAuthUserRef(currentUserId)}
where id = ${sqlString(record.internalId ?? "")}
  and record_status = 'published';
`);
};

const persistUploadPlan = async (plan: UploadPlan, currentUserId: string) => {
  let nextPublisherNo = (await getNextSequentialNumber()) + 1;
  const undoPayload: UploadUndoPayload = { publishers: [] };
  const affectedPublisherIds: string[] = [];
  for (const row of plan.rows) {
    if (!row.draftRecord) throw new UploadValidationError(`行 ${row.rowNumber} のデータが不足しています`);
    if (row.action === "create") {
      const created = await insertPublisherRecord(row.draftRecord, nextPublisherNo, currentUserId);
      const afterSnapshot = await loadRawPublisherSnapshotByInternalId(created.publisherKey);
      undoPayload.publishers.push({ action: "create", id: created.publisherId, internalId: created.publisherKey, beforeRow: null, afterRow: afterSnapshot });
      affectedPublisherIds.push(created.publisherId);
      nextPublisherNo += 1;
      continue;
    }
    const updateRecord = { ...row.draftRecord, id: row.existingRecord?.id ?? row.draftRecord.id, internalId: row.existingRecord?.internalId ?? row.draftRecord.internalId };
    const beforeSnapshot = await loadRawPublisherSnapshotByInternalId(updateRecord.internalId ?? "");
    await updatePublisherRecord(updateRecord, currentUserId);
    const afterSnapshot = await loadRawPublisherSnapshotByInternalId(updateRecord.internalId ?? "");
    undoPayload.publishers.push({ action: "update", id: updateRecord.id, internalId: updateRecord.internalId ?? "", beforeRow: beforeSnapshot, afterRow: afterSnapshot });
    affectedPublisherIds.push(updateRecord.id);
  }
  await insertUploadUndoLog({
    currentUserId,
    fileName: plan.fileName,
    importedCount: affectedPublisherIds.length,
    createCount: plan.createCount,
    updateCount: plan.updateCount,
    payload: undoPayload,
  });
  return affectedPublisherIds;
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
    const fileName = String(body.fileName ?? "publisher_masters.csv");
    const fileSizeBytes = Number(body.fileSizeBytes ?? Buffer.byteLength(csvText, "utf8"));
    if (mode !== "preview" && mode !== "commit") return NextResponse.json({ error: "mode is required" }, { status: 400 });
    if (!csvText.trim()) return NextResponse.json({ error: "csvText is required" }, { status: 400 });
    if (!Number.isFinite(fileSizeBytes) || fileSizeBytes > MAX_CSV_UPLOAD_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "4MBを超えるためアップロードできません。4MB以下のCSVを選択してください。" }, { status: 400 });
    }
    const plan = await buildUploadPlan(csvText, fileName);
    if (mode === "preview") return NextResponse.json(plan);
    if (!plan.canCommit) return NextResponse.json({ ...plan, error: "エラーがあるため取り込めません" }, { status: 400 });
    const affectedPublisherIds = await withTransaction(async () => persistUploadPlan(plan, currentUser.id));
    return NextResponse.json({ ...plan, affectedPublisherIds, importedCount: affectedPublisherIds.length });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }
    return createRouteErrorResponse(error, "CSVアップロードに失敗しました", {
      databaseMessage: "データベースに接続できないため出版社CSVを取り込めません。",
    });
  }
}
