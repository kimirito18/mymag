import { NextRequest, NextResponse } from "next/server";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { queryRows, withTransaction } from "@/app/lib/server-postgres";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { magazineMasterFieldDictionary } from "@/app/lib/public-field-dictionaries";
import { splitEscapedPipe, splitEscapedPipeList, splitStructuredCsvEntries } from "@/app/lib/csv-pipe-utils";
import type { MagazineMasterRecord } from "@/app/lib/types";

export const runtime = "nodejs";

type UploadMode = "preview" | "commit";

type UploadBody = {
  mode?: unknown;
  csvText?: unknown;
  fileName?: unknown;
  fileSizeBytes?: unknown;
};

type UploadFieldId = keyof typeof magazineMasterFieldDictionary;

type CsvSourceRow = {
  rowNumber: number;
  cells: Partial<Record<UploadFieldId, string>>;
  providedFields: Set<UploadFieldId>;
};

type ExistingPublisherRow = {
  publisherKey: string;
  publisherId: string;
  name: string;
  reading: string;
};

type ExistingMagazineRow = {
  internalId: string;
  id: string;
  name: string;
  reading: string;
};

type PublisherToken = {
  role: string;
  name: string;
  reading: string;
  publisherId: string;
};

type RelatedMagazineToken = {
  role: string;
  name: string;
  reading: string;
  magazineId: string;
};

type PlannedPublisherRef =
  | {
      kind: "existing";
      role: string;
      name: string;
      reading: string;
      publisherKey: string;
      publisherId: string;
      message?: string;
    }
  | {
      kind: "create";
      role: string;
      name: string;
      reading: string;
      planKey: string;
      message: string;
    };

type PlannedRelatedMagazineRef = {
  role: string;
  name: string;
  reading: string;
  magazineKey?: string;
  magazineId?: string;
  message?: string;
};

type UploadAction = "create" | "update";

type PlannedUploadRow = {
  rowNumber: number;
  action: UploadAction;
  sourceId: string;
  targetId: string;
  title: string;
  status: "ready" | "error";
  messages: string[];
  resolvedPublishers: PlannedPublisherRef[];
  resolvedRelatedMagazines: PlannedRelatedMagazineRef[];
  draftRecord?: MagazineMasterRecord;
  existingRecord?: MagazineMasterRecord;
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

type UndoSnapshotEntry = {
  action: "create" | "update";
  id: string;
  internalId: string;
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
};

type UploadUndoPayload = {
  magazines: UndoSnapshotEntry[];
  publishers: UndoSnapshotEntry[];
};

const MAGAZINE_PUBLISHER_ROLE_OPTIONS = new Set(["発行", "発売", "編集"]);

type PersistedPublisherRow = {
  publisher_key: string;
  publisher_id: string;
  name: string;
  reading: string;
  role: string;
};

type PersistedRelatedMagazineRow = {
  magazine_key?: string;
  magazine_id?: string;
  name: string;
  reading: string;
  role: string;
};

class UploadValidationError extends Error {}

const MAX_CSV_UPLOAD_FILE_SIZE_BYTES = 4 * 1024 * 1024;

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;
const sqlTextArray = (values: string[]) => `array[${values.map(sqlString).join(", ")}]::text[]`;
const sqlAuthUserRef = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "null";
  return `${sqlString(normalized)}::uuid`;
};

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
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  } catch {
    return {} as Record<string, unknown>;
  }
};

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const joinValues = (values: string[]) => values.filter(Boolean).join(" | ");

const splitJoinedValues = (value: string) => splitEscapedPipe(value);

const normalizeRequiredText = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) {
    throw new UploadValidationError(`${label}は必須です`);
  }
  return normalized;
};

const normalizePartialDate = (value: string, label: string) => {
  const text = value.trim();
  if (!text) return "";
  if (!/^[0-9-]+$/.test(text)) throw new UploadValidationError(`${label}は数字とハイフンのみで入力してください`);
  const parts = text.split("-");
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => part === "")) {
    throw new UploadValidationError(`${label}はYYYY、YYYY-MM、YYYY-MM-DDのいずれかで入力してください`);
  }
  const [year, month, day] = parts;
  if (!/^\d{4}$/.test(year)) throw new UploadValidationError(`${label}の年は4桁で入力してください`);
  if (month != null) {
    if (!/^\d{1,2}$/.test(month)) throw new UploadValidationError(`${label}の月は1-2桁で入力してください`);
    const monthNumber = Number(month);
    if (monthNumber < 1 || monthNumber > 12) throw new UploadValidationError(`${label}の月が範囲外です`);
  }
  if (day != null) {
    if (!/^\d{1,2}$/.test(day)) throw new UploadValidationError(`${label}の日は1-2桁で入力してください`);
    const dayNumber = Number(day);
    if (dayNumber < 1 || dayNumber > 31) throw new UploadValidationError(`${label}の日が範囲外です`);
  }
  return text;
};

const normalizePipeList = (value: string) => splitEscapedPipeList(value);

const isPublisherId = (value: string) => /^P[0-9]+$/.test(value);
const isMagazineId = (value: string) => /^M[0-9]+$/.test(value);

const publicFieldEntries = Object.entries(magazineMasterFieldDictionary).filter(
  ([, entry]) => entry.visibility === "public",
) as Array<[UploadFieldId, (typeof magazineMasterFieldDictionary)[UploadFieldId]]>;

const headerLabelToFieldId = new Map(publicFieldEntries.map(([fieldId, entry]) => [entry.labelJa, fieldId]));

const parseCsvText = (csvText: string) => {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    if (char === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        current += '"';
        index += 1;
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
      if (char === "\r" && csvText[index + 1] === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  if (inQuotes) {
    throw new UploadValidationError("CSVのダブルクォートが閉じられていません");
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
};

const parseStructuredTokens = (
  value: string,
  kind: "publisher" | "magazine",
): Array<PublisherToken | RelatedMagazineToken> => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) throw new Error();
      return parsed.map((row) => ({
        role: String(row.role ?? "").trim(),
        name: String(row.name ?? "").trim(),
        reading: String(row.reading ?? "").trim(),
        ...(kind === "publisher"
          ? { publisherId: String(row.publisher_id ?? row.id ?? "").trim() }
          : { magazineId: String(row.magazine_id ?? row.id ?? "").trim() }),
      }));
    } catch {
      throw new UploadValidationError(
        `${kind === "publisher" ? "出版社" : "関連誌"}の値をJSONとして解釈できません`,
      );
    }
  }

  return splitStructuredCsvEntries(trimmed)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = splitEscapedPipe(part);
      const nonEmptyPieces = pieces.filter(Boolean);
      const empty =
        kind === "publisher"
          ? { role: "", name: "", reading: "", publisherId: "" }
          : { role: "", name: "", reading: "", magazineId: "" };
      if (nonEmptyPieces.length === 0) return empty;
      if (nonEmptyPieces.length === 1) {
        return kind === "publisher"
          ? { role: "発行", name: nonEmptyPieces[0], reading: "", publisherId: "" }
          : { role: "", name: nonEmptyPieces[0], reading: "", magazineId: "" };
      }
      if (nonEmptyPieces.length === 2) {
        if (kind === "publisher") {
          if (MAGAZINE_PUBLISHER_ROLE_OPTIONS.has(nonEmptyPieces[0])) {
            return {
              role: nonEmptyPieces[0],
              name: nonEmptyPieces[1],
              reading: "",
              publisherId: "",
            };
          }
          if (isPublisherId(nonEmptyPieces[0])) {
            return { role: "発行", name: nonEmptyPieces[1], reading: "", publisherId: nonEmptyPieces[0] };
          }
          if (isPublisherId(nonEmptyPieces[1])) {
            return { role: "発行", name: nonEmptyPieces[0], reading: "", publisherId: nonEmptyPieces[1] };
          }
          return { role: "", name: nonEmptyPieces[0], reading: nonEmptyPieces[1], publisherId: "" };
        }
        if (isMagazineId(nonEmptyPieces[0])) {
          return { role: "", name: nonEmptyPieces[1], reading: "", magazineId: nonEmptyPieces[0] };
        }
        if (isMagazineId(nonEmptyPieces[1])) {
          return { role: "", name: nonEmptyPieces[0], reading: "", magazineId: nonEmptyPieces[1] };
        }
        return { role: "", name: nonEmptyPieces[0], reading: nonEmptyPieces[1], magazineId: "" };
      }

      const idIndex = nonEmptyPieces.findIndex((piece) =>
        kind === "publisher" ? isPublisherId(piece) : isMagazineId(piece),
      );
      const role = nonEmptyPieces[0];
      const name = nonEmptyPieces[1] ?? "";
      const reading = idIndex === 2 ? "" : nonEmptyPieces[2] ?? "";
      const idValue =
        idIndex >= 0 ? nonEmptyPieces[idIndex] : nonEmptyPieces[3] && (kind === "publisher" ? isPublisherId(nonEmptyPieces[3]) : isMagazineId(nonEmptyPieces[3])) ? nonEmptyPieces[3] : "";

      return kind === "publisher"
        ? { role, name, reading, publisherId: idValue }
        : { role, name, reading, magazineId: idValue };
    });
};

const normalizeTitleVariants = (aliasName: string, aliasReading: string) => {
  const names = splitJoinedValues(aliasName);
  const readings = splitJoinedValues(aliasReading);
  return names.map((title, index) => ({
    title,
    reading: readings[index] ?? "",
  }));
};

const buildMagazineSearchFields = (input: {
  magazineId?: string;
  title?: string;
  reading?: string;
  publisherNames?: string[];
  titleVariants?: Array<{ title?: unknown; reading?: unknown }>;
}) => {
  const variants = input.titleVariants ?? [];
  const variantTitles = variants.map((variant) => asString(variant.title).trim()).filter(Boolean);
  const variantReadings = variants.map((variant) => asString(variant.reading).trim()).filter(Boolean);
  const publisherNames = input.publisherNames ?? [];
  return {
    searchText: [
      input.magazineId ?? "",
      input.title ?? "",
      input.reading ?? "",
      ...publisherNames,
      ...variantTitles,
      ...variantReadings,
    ]
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join(" "),
    searchReading: [input.reading ?? "", ...variantReadings]
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join(" "),
  };
};

const rowToMagazineRecord = (row: Record<string, string | null>): MagazineMasterRecord => {
  const variants = parseJson<Array<{ title?: unknown; reading?: unknown }>>(row.title_variants_json, []);
  const aliasNames = variants.map((variant) => asString(variant.title));
  const aliasReadings = variants.map((variant) => asString(variant.reading));
  return {
    id: row.magazine_id ?? "",
    internalId: row.id ?? "",
    name: row.title ?? "",
    reading: row.title_reading ?? "",
    aliasName: joinValues(aliasNames),
    aliasReading: joinValues(aliasReadings),
    publishers: row.publishers_json ?? "[]",
    publicationFrequency: parseJson<string[]>(row.publication_frequency_json, []),
    firstPublishedDate: row.first_published_date ?? "",
    closedDate: row.closed_date ?? "",
    issn: row.issn ?? "",
    jpno: row.jpno ?? "",
    relatedMagazines: row.related_magazines_json ?? "[]",
    relationNote: row.relation_note ?? "",
    memo: row.note ?? "",
    tag: parseJson<string[]>(row.tags_json, []),
    searchText: row.search_text ?? "",
    updatedAt: row.updated_at ?? "",
  };
};

const loadMagazineRecordsByIds = async (ids: string[]) => {
  if (ids.length === 0) return new Map<string, MagazineMasterRecord>();
  const rows = await queryRows(`
select
  mt.magazine_id,
  mt.id,
  mt.title,
  mt.title_reading,
  mt.title_variants::text as title_variants_json,
  coalesce(mt.publishers, '[]'::jsonb)::text as publishers_json,
  mt.publication_frequency::text as publication_frequency_json,
  coalesce(mt.first_published_date::text, '') as first_published_date,
  coalesce(mt.closed_date::text, '') as closed_date,
  mt.issn,
  mt.jpno,
  coalesce(mt.related_magazines, '[]'::jsonb)::text as related_magazines_json,
  mt.relation_note,
  mt.note,
  to_jsonb(mt.tags)::text as tags_json,
  coalesce(mt.search_text, '') as search_text,
  coalesce(mt.updated_at::text, '') as updated_at
from public.magazine_titles mt
where mt.record_status = 'published'
  and mt.magazine_id in (${ids.map(sqlString).join(", ")});
`);
  return new Map(rows.map((row) => [row.magazine_id ?? "", rowToMagazineRecord(row)]));
};

const loadExistingPublishers = async () => {
  const rows = await queryRows(`
select
  p.id,
  p.publisher_id,
  p.publisher_name,
  coalesce(p.publisher_reading, '') as publisher_reading
from public.publishers p
where p.record_status = 'published';
`);
  const publishers = rows.map((row) => ({
    publisherKey: row.id ?? "",
    publisherId: row.publisher_id ?? "",
    name: row.publisher_name ?? "",
    reading: row.publisher_reading ?? "",
  }));
  return {
    all: publishers,
    byId: new Map(publishers.map((row) => [row.publisherId, row])),
    byName: publishers.reduce<Map<string, ExistingPublisherRow[]>>((map, row) => {
      const current = map.get(row.name) ?? [];
      current.push(row);
      map.set(row.name, current);
      return map;
    }, new Map()),
    byReading: publishers.reduce<Map<string, ExistingPublisherRow[]>>((map, row) => {
      if (!row.reading) return map;
      const current = map.get(row.reading) ?? [];
      current.push(row);
      map.set(row.reading, current);
      return map;
    }, new Map()),
  };
};

const loadExistingMagazines = async () => {
  const rows = await queryRows(`
select
  mt.id,
  mt.magazine_id,
  mt.title,
  mt.title_reading
from public.magazine_titles mt
where mt.record_status = 'published';
`);
  const magazines = rows.map((row) => ({
    internalId: row.id ?? "",
    id: row.magazine_id ?? "",
    name: row.title ?? "",
    reading: row.title_reading ?? "",
  }));
  return {
    all: magazines,
    byId: new Map(magazines.map((row) => [row.id, row])),
    byName: magazines.reduce<Map<string, ExistingMagazineRow[]>>((map, row) => {
      const current = map.get(row.name) ?? [];
      current.push(row);
      map.set(row.name, current);
      return map;
    }, new Map()),
    byReading: magazines.reduce<Map<string, ExistingMagazineRow[]>>((map, row) => {
      if (!row.reading) return map;
      const current = map.get(row.reading) ?? [];
      current.push(row);
      map.set(row.reading, current);
      return map;
    }, new Map()),
  };
};

const parseCsvRows = (csvText: string) => {
  const parsed = parseCsvText(csvText);
  if (parsed.length === 0) {
    throw new UploadValidationError("CSVにデータがありません");
  }
  const [headerRow, ...valueRows] = parsed;
  if (headerRow.length === 0) {
    throw new UploadValidationError("CSVヘッダーを読み取れません");
  }
  const normalizedHeaders = headerRow.map((header) => header.trim());
  const duplicateHeaders = normalizedHeaders.filter((header, index) => normalizedHeaders.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    throw new UploadValidationError(`CSVヘッダーが重複しています: ${Array.from(new Set(duplicateHeaders)).join(", ")}`);
  }
  const unknownHeaders = normalizedHeaders.filter((header) => !headerLabelToFieldId.has(header));
  if (unknownHeaders.length > 0) {
    throw new UploadValidationError(`未対応のCSVヘッダーがあります: ${unknownHeaders.join(", ")}`);
  }
  const fieldIds = normalizedHeaders.map((header) => headerLabelToFieldId.get(header) as UploadFieldId);
  if (!fieldIds.includes("id")) {
    throw new UploadValidationError("CSVヘッダーにID列が必要です");
  }

  const rows: CsvSourceRow[] = valueRows.map((valueRow, rowIndex) => {
    const cells: Partial<Record<UploadFieldId, string>> = {};
    const providedFields = new Set<UploadFieldId>();
    fieldIds.forEach((fieldId, columnIndex) => {
      const value = String(valueRow[columnIndex] ?? "");
      cells[fieldId] = value;
      if (value.trim()) {
        providedFields.add(fieldId);
      }
    });
    return {
      rowNumber: rowIndex + 2,
      cells,
      providedFields,
    };
  });

  if (rows.length === 0) {
    throw new UploadValidationError("CSVに明細行がありません");
  }

  return {
    headers: normalizedHeaders,
    rows,
  };
};

const resolvePublisherPlans = (
  tokens: PublisherToken[],
  lookup: Awaited<ReturnType<typeof loadExistingPublishers>>,
  plannedCreates: Map<string, { name: string; reading: string }>,
  messages: string[],
) => {
  const resolved: PlannedPublisherRef[] = [];
  for (const token of tokens) {
    const role = token.role || "発行";
    const name = token.name.trim();
    const reading = token.reading.trim();
    const publisherId = token.publisherId.trim();

    if (!name && !reading && !publisherId) continue;

    let matched: ExistingPublisherRow | null = null;
    if (publisherId) {
      matched = lookup.byId.get(publisherId) ?? null;
      if (!matched && name) {
        const byName = lookup.byName.get(name) ?? [];
        if (byName.length === 1) {
          matched = byName[0];
          messages.push(`出版社ID ${publisherId} は未一致のため、名称「${name}」で補完します`);
        }
      }
      if (!matched) {
        throw new UploadValidationError(`出版社IDを解決できません: ${publisherId}`);
      }
    } else if (name && reading) {
      const byName = lookup.byName.get(name) ?? [];
      const exact = byName.filter((row) => row.reading === reading);
      if (exact.length === 1) {
        matched = exact[0];
      } else if (exact.length > 1) {
        throw new UploadValidationError(`出版社の候補が複数あります: ${name} / ${reading}`);
      }
    }

    if (!matched && name) {
      const byName = lookup.byName.get(name) ?? [];
      if (byName.length === 1) {
        matched = byName[0];
      } else if (byName.length > 1) {
        throw new UploadValidationError(`同名の出版社が複数あります: ${name}`);
      }
    }

    if (!matched && reading) {
      const byReading = lookup.byReading.get(reading) ?? [];
      if (byReading.length === 1) {
        matched = byReading[0];
      } else if (byReading.length > 1) {
        throw new UploadValidationError(`同じ読みの出版社が複数あります: ${reading}`);
      }
    }

    if (matched) {
      resolved.push({
        kind: "existing",
        role,
        name: name || matched.name,
        reading: reading || matched.reading,
        publisherKey: matched.publisherKey,
        publisherId: matched.publisherId,
      });
      continue;
    }

    throw new UploadValidationError(
      `出版社を解決できません: ${name || publisherId || reading || "未入力"}。雑誌マスターCSVでは既存出版社のみ指定できます。先に出版社マスターへ登録・確認してください`,
    );
  }

  if (resolved.length === 0) {
    throw new UploadValidationError("出版社を1件以上入力してください");
  }

  return resolved;
};

const resolveRelatedMagazinePlans = (
  tokens: RelatedMagazineToken[],
  lookup: Awaited<ReturnType<typeof loadExistingMagazines>>,
  messages: string[],
) => {
  return tokens
    .map((token) => {
      const role = token.role.trim();
      const name = token.name.trim();
      const reading = token.reading.trim();
      const magazineId = token.magazineId.trim();
      if (!role && !name && !reading && !magazineId) return null;

      let matched: ExistingMagazineRow | null = null;
      if (magazineId) {
        matched = lookup.byId.get(magazineId) ?? null;
        if (!matched && name) {
          const byName = lookup.byName.get(name) ?? [];
          if (byName.length === 1) {
            matched = byName[0];
            messages.push(`関連誌ID ${magazineId} は未一致のため、名称「${name}」で補完します`);
          }
        }
      }
      if (!matched && name) {
        const byName = lookup.byName.get(name) ?? [];
        if (byName.length === 1) matched = byName[0];
      }
      if (!matched && reading) {
        const byReading = lookup.byReading.get(reading) ?? [];
        if (byReading.length === 1) matched = byReading[0];
      }

      return {
        role,
        name: name || matched?.name || "",
        reading: reading || matched?.reading || "",
        magazineKey: matched?.internalId,
        magazineId: matched?.id ?? magazineId,
      } satisfies PlannedRelatedMagazineRef;
    })
    .filter(Boolean) as PlannedRelatedMagazineRef[];
};

const buildDraftRecord = (
  action: UploadAction,
  sourceRow: CsvSourceRow,
  existingRecord: MagazineMasterRecord | undefined,
  publishers: PlannedPublisherRef[],
  relatedMagazines: PlannedRelatedMagazineRef[],
) => {
  const getValue = (fieldId: UploadFieldId) => String(sourceRow.cells[fieldId] ?? "");
  const hasField = (fieldId: UploadFieldId) => sourceRow.providedFields.has(fieldId);
  const current = existingRecord ?? {
    id: "",
    internalId: "",
    name: "",
    reading: "",
    aliasName: "",
    aliasReading: "",
    publishers: "[]",
    publicationFrequency: [],
    firstPublishedDate: "",
    closedDate: "",
    issn: "",
    jpno: "",
    relatedMagazines: "[]",
    relationNote: "",
    memo: "",
    tag: [],
    searchText: "",
    updatedAt: "",
  };

  const name = action === "create" || hasField("name") ? normalizeRequiredText(getValue("name"), "タイトル") : current.name;
  const reading =
    action === "create" || hasField("reading") ? normalizeRequiredText(getValue("reading"), "読み") : current.reading;
  const aliasName = hasField("aliasName") ? getValue("aliasName").trim() : current.aliasName;
  const aliasReading = hasField("aliasReading") ? getValue("aliasReading").trim() : current.aliasReading;
  const publicationFrequency = hasField("publicationFrequency")
    ? normalizePipeList(getValue("publicationFrequency"))
    : current.publicationFrequency;
  const firstPublishedDate = hasField("firstPublishedDate")
    ? normalizePartialDate(getValue("firstPublishedDate"), "創刊日")
    : current.firstPublishedDate;
  const closedDate = hasField("closedDate") ? normalizePartialDate(getValue("closedDate"), "休廃刊日") : current.closedDate;
  const issn = hasField("issn") ? getValue("issn").trim() : current.issn;
  const jpno = hasField("jpno") ? getValue("jpno").trim() : current.jpno;
  const relationNote = hasField("relationNote") ? getValue("relationNote").trim() : current.relationNote;
  const memo = hasField("memo") ? getValue("memo").trim() : current.memo;
  const tag = hasField("tag") ? normalizePipeList(getValue("tag")) : current.tag;

  const persistedPublishers = publishers.map((row) =>
    row.kind === "existing"
      ? {
          role: row.role || "発行",
          name: row.name,
          reading: row.reading,
          publisher_key: row.publisherKey,
          publisher_id: row.publisherId,
        }
      : {
          role: row.role || "発行",
          name: row.name,
          reading: row.reading,
          publisher_key: "",
          publisher_id: "",
        },
  );

  const persistedRelatedMagazines = relatedMagazines.map((row) => ({
    role: row.role,
    name: row.name,
    reading: row.reading,
    magazine_key: row.magazineKey ?? "",
    magazine_id: row.magazineId ?? "",
  }));

  return {
    ...current,
    name,
    reading,
    aliasName,
    aliasReading,
    publishers: JSON.stringify(persistedPublishers),
    publicationFrequency,
    firstPublishedDate,
    closedDate,
    issn,
    jpno,
    relatedMagazines: JSON.stringify(persistedRelatedMagazines),
    relationNote,
    memo,
    tag,
  } satisfies MagazineMasterRecord;
};

const buildUploadPlan = async (csvText: string, fileName: string): Promise<UploadPlan> => {
  const parsed = parseCsvRows(csvText);
  const updateIds = Array.from(
    new Set(
      parsed.rows
        .map((row) => String(row.cells.id ?? "").trim())
        .filter(Boolean),
    ),
  );
  const [existingMagazinesById, publisherLookup, relatedMagazineLookup] = await Promise.all([
    loadMagazineRecordsByIds(updateIds),
    loadExistingPublishers(),
    loadExistingMagazines(),
  ]);

  const seenCreateTitles = new Set<string>();
  const seenUpdateIds = new Set<string>();
  const plannedPublisherCreates = new Map<string, { name: string; reading: string }>();

  const rows = parsed.rows.map((sourceRow) => {
    const messages: string[] = [];
    const sourceId = String(sourceRow.cells.id ?? "").trim();
    const action: UploadAction = sourceId ? "update" : "create";
    const rowMessages: string[] = [];
    const errorMessages: string[] = [];
    let existingRecord: MagazineMasterRecord | undefined;
    let draftRecord: MagazineMasterRecord | undefined;
    let resolvedPublishers: PlannedPublisherRef[] = [];
    let resolvedRelatedMagazines: PlannedRelatedMagazineRef[] = [];

    try {
      if (action === "update") {
        if (seenUpdateIds.has(sourceId)) {
          throw new UploadValidationError(`同じIDがCSV内で重複しています: ${sourceId}`);
        }
        seenUpdateIds.add(sourceId);
        existingRecord = existingMagazinesById.get(sourceId);
        if (!existingRecord) {
          throw new UploadValidationError(`更新対象の雑誌マスターが見つかりません: ${sourceId}`);
        }
      }

      if (action === "create") {
        const title = String(sourceRow.cells.name ?? "").trim();
        if (!title) {
          throw new UploadValidationError("新規追加ではタイトルが必須です");
        }
        if (seenCreateTitles.has(title)) {
          throw new UploadValidationError(`同じタイトルの新規行がCSV内で重複しています: ${title}`);
        }
        seenCreateTitles.add(title);
        const duplicates = relatedMagazineLookup.byName.get(title) ?? [];
        if (duplicates.length > 0) {
          throw new UploadValidationError(`同じタイトルの雑誌マスターが既に存在します: ${title}`);
        }
      }

      const publisherValue =
        action === "create" || sourceRow.providedFields.has("publishers")
          ? String(sourceRow.cells.publishers ?? "")
          : existingRecord?.publishers ?? "";
      const publisherTokens = parseStructuredTokens(publisherValue, "publisher") as PublisherToken[];
      resolvedPublishers = resolvePublisherPlans(publisherTokens, publisherLookup, plannedPublisherCreates, messages);
      const relatedValue =
        action === "create" || sourceRow.providedFields.has("relatedMagazines")
          ? String(sourceRow.cells.relatedMagazines ?? "")
          : existingRecord?.relatedMagazines ?? "";
      const relatedTokens = parseStructuredTokens(relatedValue, "magazine") as RelatedMagazineToken[];
      resolvedRelatedMagazines = resolveRelatedMagazinePlans(relatedTokens, relatedMagazineLookup, messages);
      draftRecord = buildDraftRecord(action, sourceRow, existingRecord, resolvedPublishers, resolvedRelatedMagazines);

      for (const publisherRow of resolvedPublishers) {
        if (publisherRow.kind === "create") {
          rowMessages.push(publisherRow.message);
        }
      }
      rowMessages.push(...messages);
    } catch (error) {
      errorMessages.push(error instanceof Error ? error.message : "行の検証に失敗しました");
    }

    const status = errorMessages.length > 0 ? "error" : "ready";
    const targetId = action === "update" ? sourceId : "";
    return {
      rowNumber: sourceRow.rowNumber,
      action,
      sourceId,
      targetId,
      title: draftRecord?.name ?? String(sourceRow.cells.name ?? "").trim() ?? existingRecord?.name ?? "",
      status,
      messages: status === "error" ? errorMessages : rowMessages.length > 0 ? rowMessages : ["取り込み可能です"],
      resolvedPublishers,
      resolvedRelatedMagazines,
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

const getNextSequentialNumber = async (table: "magazine_titles" | "publishers", idColumn: "magazine_id" | "publisher_id", prefix: "M" | "P") => {
  const rows = await queryRows(`
select coalesce(max(substring(${idColumn} from 2)::integer), 0) as current_no
from public.${table}
where ${idColumn} ~ '^${prefix}[0-9]+$';
`);
  return Number(rows[0]?.current_no ?? 0);
};

const loadRawMagazineSnapshotByInternalId = async (internalId: string) => {
  const rows = await queryRows(`
select to_jsonb(mt)::text as row_json
from public.magazine_titles mt
where mt.id = ${sqlString(internalId)}
limit 1;
`);
  return parseJsonObject(rows[0]?.row_json);
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

const insertPublisher = async (input: {
  name: string;
  reading: string;
  nextNo: number;
  currentUserId: string;
}) => {
  const publisherId = `P${String(input.nextNo).padStart(6, "0")}`;
  const publisherKey = createInternalId("pu");
  const searchText = [input.name, input.reading].filter(Boolean).join(" ");
  await queryRows(`
insert into public.publishers (
  id,
  publisher_id,
  publisher_name,
  publisher_reading,
  address,
  url,
  related_link,
  memo,
  related_publishers,
  tags,
  search_text,
  record_status,
  owner_user_id,
  created_by,
  updated_by,
  approved_by,
  approved_at
) values (
  ${sqlString(publisherKey)},
  ${sqlString(publisherId)},
  ${sqlString(input.name)},
  ${sqlString(input.reading)},
  '',
  '',
  '[]'::jsonb,
  '',
  '[]'::jsonb,
  array[]::text[],
  ${sqlString(searchText)},
  'published',
  ${sqlAuthUserRef(input.currentUserId)},
  ${sqlAuthUserRef(input.currentUserId)},
  ${sqlAuthUserRef(input.currentUserId)},
  ${sqlAuthUserRef(input.currentUserId)},
  now()
);
`);
  return {
    publisherKey,
    publisherId,
    name: input.name,
    reading: input.reading,
  };
};

const insertMagazine = async (input: {
  record: MagazineMasterRecord;
  publishers: PersistedPublisherRow[];
  relatedMagazines: PersistedRelatedMagazineRow[];
  nextNo: number;
  currentUserId: string;
}) => {
  const magazineId = `M${String(input.nextNo).padStart(6, "0")}`;
  const magazineKey = createInternalId("mt");
  const titleVariants = normalizeTitleVariants(input.record.aliasName, input.record.aliasReading);
  const searchFields = buildMagazineSearchFields({
    magazineId,
    title: input.record.name,
    reading: input.record.reading,
    publisherNames: input.publishers.map((row) => row.name),
    titleVariants,
  });
  const primaryPublisher = input.publishers[0];
  await queryRows(`
insert into public.magazine_titles (
  magazine_id,
  id,
  publisher_key,
  title,
  title_reading,
  title_variants,
  publishers,
  publisher_id,
  publication_frequency,
  first_published_date,
  closed_date,
  issn,
  jpno,
  note,
  related_magazines,
  relation_note,
  tags,
  search_text,
  search_reading,
  record_status,
  owner_user_id,
  created_by,
  updated_by,
  approved_by,
  approved_at
) values (
  ${sqlString(magazineId)},
  ${sqlString(magazineKey)},
  ${sqlString(primaryPublisher.publisher_key)},
  ${sqlString(input.record.name)},
  ${sqlString(input.record.reading)},
  ${sqlJson(titleVariants)},
  ${sqlJson(input.publishers)},
  ${sqlString(primaryPublisher.publisher_id)},
  ${sqlJson(input.record.publicationFrequency)},
  ${sqlString(input.record.firstPublishedDate)},
  ${sqlString(input.record.closedDate)},
  ${sqlString(input.record.issn)},
  ${sqlString(input.record.jpno)},
  ${sqlString(input.record.memo)},
  ${sqlJson(input.relatedMagazines)},
  ${sqlString(input.record.relationNote)},
  ${sqlTextArray(input.record.tag)},
  ${sqlString(searchFields.searchText)},
  ${sqlString(searchFields.searchReading)},
  'published',
  ${sqlAuthUserRef(input.currentUserId)},
  ${sqlAuthUserRef(input.currentUserId)},
  ${sqlAuthUserRef(input.currentUserId)},
  ${sqlAuthUserRef(input.currentUserId)},
  now()
);
`);
  return {
    magazineId,
    magazineKey,
  };
};

const updateMagazine = async (input: {
  record: MagazineMasterRecord;
  publishers: PersistedPublisherRow[];
  relatedMagazines: PersistedRelatedMagazineRow[];
  currentUserId: string;
}) => {
  const titleVariants = normalizeTitleVariants(input.record.aliasName, input.record.aliasReading);
  const searchFields = buildMagazineSearchFields({
    magazineId: input.record.id,
    title: input.record.name,
    reading: input.record.reading,
    publisherNames: input.publishers.map((row) => row.name),
    titleVariants,
  });
  const primaryPublisher = input.publishers[0];
  await queryRows(`
update public.magazine_titles
set
  publisher_key = ${sqlString(primaryPublisher.publisher_key)},
  publisher_id = ${sqlString(primaryPublisher.publisher_id)},
  title = ${sqlString(input.record.name)},
  title_reading = ${sqlString(input.record.reading)},
  title_variants = ${sqlJson(titleVariants)},
  publishers = ${sqlJson(input.publishers)},
  publication_frequency = ${sqlJson(input.record.publicationFrequency)},
  first_published_date = ${sqlString(input.record.firstPublishedDate)},
  closed_date = ${sqlString(input.record.closedDate)},
  issn = ${sqlString(input.record.issn)},
  jpno = ${sqlString(input.record.jpno)},
  note = ${sqlString(input.record.memo)},
  related_magazines = ${sqlJson(input.relatedMagazines)},
  relation_note = ${sqlString(input.record.relationNote)},
  tags = ${sqlTextArray(input.record.tag)},
  search_text = ${sqlString(searchFields.searchText)},
  search_reading = ${sqlString(searchFields.searchReading)},
  updated_by = ${sqlAuthUserRef(input.currentUserId)}
where id = ${sqlString(input.record.internalId ?? "")}
  and record_status = 'published';
`);
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
  and target_type = 'magazine_csv_upload'
  and undone_at is null;
`);

  await queryRows(`
insert into public.user_logs (
  user_id,
  actor_user_id,
  log_type,
  target_type,
  target_id,
  metadata,
  before_data,
  after_data,
  note
) values (
  ${sqlString(currentUserId)}::uuid,
  ${sqlString(currentUserId)}::uuid,
  'undo_action',
  'magazine_csv_upload',
  ${sqlString(uploadId)},
  ${sqlJson({
    kind: "magazine_csv_upload",
    label: "Undo Upload",
    fileName,
    importedCount,
    createCount,
    updateCount,
  })},
  ${sqlJson(payload)},
  ${sqlJson({
    fileName,
    importedCount,
    createCount,
    updateCount,
  })},
  'csv_upload'
);
`);
};

const persistUploadPlan = async (plan: UploadPlan, currentUserId: string) => {
  const planKeyToPublisher = new Map<string, { publisherKey: string; publisherId: string; name: string; reading: string }>();
  const publisherCreatePlans = new Map<string, { name: string; reading: string }>();
  const undoPayload: UploadUndoPayload = {
    magazines: [],
    publishers: [],
  };
  plan.rows.forEach((row) => {
    row.resolvedPublishers.forEach((publisher) => {
      if (publisher.kind === "create") {
        publisherCreatePlans.set(publisher.planKey, { name: publisher.name, reading: publisher.reading });
      }
    });
  });

  let nextPublisherNo = (await getNextSequentialNumber("publishers", "publisher_id", "P")) + 1;
  for (const [planKey, value] of publisherCreatePlans.entries()) {
    const createdPublisher = await insertPublisher({
      name: value.name,
      reading: value.reading,
      nextNo: nextPublisherNo,
      currentUserId,
    });
    const publisherSnapshot = await loadRawPublisherSnapshotByInternalId(createdPublisher.publisherKey);
    undoPayload.publishers.push({
      action: "create",
      id: createdPublisher.publisherId,
      internalId: createdPublisher.publisherKey,
      beforeRow: null,
      afterRow: publisherSnapshot,
    });
    planKeyToPublisher.set(planKey, createdPublisher);
    nextPublisherNo += 1;
  }

  let nextMagazineNo = (await getNextSequentialNumber("magazine_titles", "magazine_id", "M")) + 1;
  const affectedMagazineIds: string[] = [];

  for (const row of plan.rows) {
    if (!row.draftRecord) {
      throw new UploadValidationError(`行 ${row.rowNumber} のデータが不足しています`);
    }

    const persistedPublishers = row.resolvedPublishers.map((publisher) => {
      if (publisher.kind === "existing") {
        return {
          publisher_key: publisher.publisherKey,
          publisher_id: publisher.publisherId,
          name: publisher.name,
          reading: publisher.reading,
          role: publisher.role || "発行",
        } satisfies PersistedPublisherRow;
      }
      const created = planKeyToPublisher.get(publisher.planKey);
      if (!created) {
        throw new UploadValidationError(`出版社の新規追加計画を解決できません: ${publisher.name}`);
      }
      return {
        publisher_key: created.publisherKey,
        publisher_id: created.publisherId,
        name: created.name,
        reading: created.reading,
        role: publisher.role || "発行",
      } satisfies PersistedPublisherRow;
    });

    const persistedRelatedMagazines = row.resolvedRelatedMagazines.map((magazine) => ({
      magazine_key: magazine.magazineKey ?? "",
      magazine_id: magazine.magazineId ?? "",
      name: magazine.name,
      reading: magazine.reading,
      role: magazine.role,
    }));

    if (row.action === "create") {
      const created = await insertMagazine({
        record: row.draftRecord,
        publishers: persistedPublishers,
        relatedMagazines: persistedRelatedMagazines,
        nextNo: nextMagazineNo,
        currentUserId,
      });
      const createdSnapshot = await loadRawMagazineSnapshotByInternalId(created.magazineKey);
      undoPayload.magazines.push({
        action: "create",
        id: created.magazineId,
        internalId: created.magazineKey,
        beforeRow: null,
        afterRow: createdSnapshot,
      });
      affectedMagazineIds.push(created.magazineId);
      nextMagazineNo += 1;
      continue;
    }

    const updateRecord = {
      ...row.draftRecord,
      id: row.existingRecord?.id ?? row.draftRecord.id,
      internalId: row.existingRecord?.internalId ?? row.draftRecord.internalId,
    };
    const beforeSnapshot = await loadRawMagazineSnapshotByInternalId(updateRecord.internalId ?? "");
    await updateMagazine({
      record: updateRecord,
      publishers: persistedPublishers,
      relatedMagazines: persistedRelatedMagazines,
      currentUserId,
    });
    const afterSnapshot = await loadRawMagazineSnapshotByInternalId(updateRecord.internalId ?? "");
    undoPayload.magazines.push({
      action: "update",
      id: updateRecord.id,
      internalId: updateRecord.internalId ?? "",
      beforeRow: beforeSnapshot,
      afterRow: afterSnapshot,
    });
    affectedMagazineIds.push(updateRecord.id);
  }

  await insertUploadUndoLog({
    currentUserId,
    fileName: plan.fileName,
    importedCount: affectedMagazineIds.length,
    createCount: plan.createCount,
    updateCount: plan.updateCount,
    payload: undoPayload,
  });

  return affectedMagazineIds;
};

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    if (currentUser.role !== "super_admin") {
      return NextResponse.json(
        {
          error: "CSVアップロードは現在、超管理者のみ利用できます",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as UploadBody;
    const mode = String(body.mode ?? "").trim() as UploadMode;
    const csvText = String(body.csvText ?? "");
    const fileName = String(body.fileName ?? "magazine_masters.csv");
    const fileSizeBytes = Number(body.fileSizeBytes ?? Buffer.byteLength(csvText, "utf8"));

    if (mode !== "preview" && mode !== "commit") {
      return NextResponse.json({ error: "mode is required" }, { status: 400 });
    }
    if (!csvText.trim()) {
      return NextResponse.json({ error: "csvText is required" }, { status: 400 });
    }
    if (!Number.isFinite(fileSizeBytes) || fileSizeBytes > MAX_CSV_UPLOAD_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "4MBを超えるためアップロードできません。4MB以下のCSVを選択してください。" }, { status: 400 });
    }

    const plan = await buildUploadPlan(csvText, fileName);
    if (mode === "preview") {
      return NextResponse.json(plan);
    }
    if (!plan.canCommit) {
      return NextResponse.json(
        {
          ...plan,
          error: "エラーがあるため取り込めません",
        },
        { status: 400 },
      );
    }

    const affectedMagazineIds = await withTransaction(async () => persistUploadPlan(plan, currentUser.id));
    return NextResponse.json({
      ...plan,
      affectedMagazineIds,
      importedCount: affectedMagazineIds.length,
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 400,
        },
      );
    }
    return createRouteErrorResponse(error, "CSVアップロードに失敗しました", {
      databaseMessage: "データベースに接続できないため雑誌マスターCSVを取り込めません。",
    });
  }
}
