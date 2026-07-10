import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { isApplicationRequestLocked, loadActiveApplicationRequest, upsertDraftApplicationRequest } from "@/app/lib/application-request-drafts";
import { loadVisibleApplicationRequests } from "@/app/lib/server-visible-application-requests";
import type { MagazineMasterRecord } from "@/app/lib/types";

export const runtime = "nodejs";

type TitleVariant = {
    title?: unknown;
    reading?: unknown;
};
type PatchValue = string | string[] | null;
type PatchBody = {
    magazineKey?: unknown;
    magazineId?: unknown;
    field?: unknown;
    value?: PatchValue;
    debugDelayMs?: unknown;
};
type PostBody = {
    name?: unknown;
    reading?: unknown;
    publishers?: unknown;
    debugDelayMs?: unknown;
};
type DeleteBody = {
    magazineKey?: unknown;
    magazineId?: unknown;
    debugDelayMs?: unknown;
};
type DeleteDependencyItem = {
    label: string;
    count: number;
};
class ValidationError extends Error {}

const ensureEditableRequestStatus = async (userId: string, entityId: string) => {
    const activeRequest = await loadActiveApplicationRequest(userId, "magazine_title", entityId);
    if (isApplicationRequestLocked(activeRequest?.status)) {
        throw new ValidationError("この雑誌マスターは申請中のため、編集中に戻すまで修正できません");
    }
};

const magazineTitleSelect = `
  mt.magazine_id,
  mt.id,
  mt.publisher_key,
  mt.title,
  mt.title_reading,
  mt.title_variants::text as title_variants_json,
  coalesce(mt.publishers, '[]'::jsonb)::text as publishers_json,
  mt.publisher_id,
  coalesce(p.publisher_name, '出版社不明') as publisher_name,
  coalesce(p.publisher_reading, 'しゅっぱんしゃふめい') as publisher_reading,
  coalesce(issue_publishers.publishers_json, '[]'::jsonb)::text as issue_publishers_json,
  coalesce(issue_publishers.publisher_search_text, '') as issue_publisher_search_text,
  mt.publication_frequency::text as publication_frequency_json,
  coalesce(mt.first_published_date::text, '') as first_published_date,
  coalesce(mt.closed_date::text, '') as closed_date,
  mt.issn,
  mt.jpno,
  mt.related_magazines::text as related_magazines_json,
  mt.relation_note,
  mt.note,
  to_jsonb(mt.tags)::text as tags_json,
  mt.search_text,
  coalesce(mt.search_reading, '') as search_reading,
  mt.record_status,
  coalesce(mt.edit_version::text, '') as edit_version,
  coalesce(mt.updated_at::text, '') as updated_at`;

const magazineTitleFromClause = `
from public.magazine_titles mt
left join public.publishers p
  on p.id = mt.publisher_key
left join lateral (
  select
    jsonb_agg(
      jsonb_build_object(
        'role', '発行',
        'name', ranked_publishers.publisher_name,
        'reading', ranked_publishers.publisher_reading,
        'publisher_key', ranked_publishers.publisher_key,
        'publisher_id', ranked_publishers.publisher_id
      )
      order by ranked_publishers.first_published_date nulls last, ranked_publishers.publisher_id
    ) as publishers_json,
    string_agg(ranked_publishers.publisher_name, ' ') as publisher_search_text
  from (
    select
      mi.publisher_key,
      mi.publisher_id,
      coalesce(publisher.publisher_name, mi.publisher_name, '出版社不明') as publisher_name,
      coalesce(publisher.publisher_reading, 'しゅっぱんしゃふめい') as publisher_reading,
      min(mi.published_date) as first_published_date
    from public.magazine_issues mi
    left join public.publishers publisher
      on publisher.id = mi.publisher_key
    where mi.magazine_key = mt.id
      and mi.record_status = 'published'
    group by
      mi.publisher_key,
      mi.publisher_id,
      coalesce(publisher.publisher_name, mi.publisher_name, '出版社不明'),
      coalesce(publisher.publisher_reading, 'しゅっぱんしゃふめい')
  ) ranked_publishers
) issue_publishers on true`;

const parseJson = <T,>(value: string | null | undefined, fallback: T): T=>{
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

const asString = (value: unknown)=>typeof value === "string" ? value : "";

const joinValues = (values: string[])=>values.filter(Boolean).join(" | ");
const splitJoinedValues = (value: unknown)=>String(value ?? "").split("|").map((part)=>part.trim()).filter(Boolean);
const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const sqlAuthUserRef = (value: string | null | undefined)=>{
    const normalized = String(value ?? "").trim();
    if (!normalized) return "null";
    return `${sqlString(normalized)}::uuid`;
};
const sqlJson = (value: unknown)=>`${sqlString(JSON.stringify(value))}::jsonb`;
const sqlNullableText = (value: string | null)=>value == null ? "null" : sqlString(value);
const sqlTextArray = (values: string[])=>`array[${values.map(sqlString).join(", ")}]::text[]`;
const sleep = (milliseconds: number)=>new Promise((resolve)=>setTimeout(resolve, milliseconds));
const normalizeDebugDelayMs = (value: unknown)=>{
    if (process.env.NODE_ENV === "production") return 0;
    const delay = Number(value);
    if (!Number.isFinite(delay) || delay <= 0) return 0;
    return Math.min(Math.round(delay), 5000);
};

const normalizeMagazineId = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^M[0-9]+$/.test(normalized) ? normalized : "";
};

const normalizeMagazineKey = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^ma_[0-9A-Za-z]+$/.test(normalized) ? normalized : "";
};

const normalizeRequiredText = (value: PatchValue, label: string)=>{
    const text = String(value ?? "").trim();
    if (!text) throw new Error(`${label}は必須です`);
    return text;
};

const normalizeText = (value: PatchValue)=>String(value ?? "").trim();

const normalizePartialDate = (value: PatchValue, label: string)=>{
    const text = normalizeText(value);
    if (!text) return "";
    if (!/^[0-9-]+$/.test(text)) throw new ValidationError(`${label}は数字とハイフンのみで入力してください`);
    const parts = text.split("-");
    if (parts.length < 1 || parts.length > 3 || parts.some((part)=>part === "")) {
        throw new ValidationError(`${label}はYYYY、YYYY-MM、YYYY-MM-DDのいずれかで入力してください`);
    }
    const [year, month, day] = parts;
    if (!/^\d{4}$/.test(year)) throw new ValidationError(`${label}の年は4桁で入力してください`);
    if (month != null) {
        if (!/^\d{1,2}$/.test(month)) throw new ValidationError(`${label}の月は1-2桁で入力してください`);
        const monthNumber = Number(month);
        if (monthNumber < 1 || monthNumber > 12) throw new ValidationError(`${label}の月が範囲外です`);
    }
    if (day != null) {
        if (!/^\d{1,2}$/.test(day)) throw new ValidationError(`${label}の日は1-2桁で入力してください`);
        const dayNumber = Number(day);
        if (dayNumber < 1 || dayNumber > 31) throw new ValidationError(`${label}の日が範囲外です`);
    }
    return text;
};

const normalizeStringArray = (value: PatchValue)=>{
    if (Array.isArray(value)) return value.map((part)=>String(part).trim()).filter(Boolean);
    return String(value ?? "").split(/[,\u3001]/).map((part)=>part.trim()).filter(Boolean);
};

const normalizeJsonArray = (value: PatchValue, label: string)=>{
    const text = String(value ?? "").trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text) as unknown;
        if (!Array.isArray(parsed)) throw new Error();
        return parsed;
    } catch {
        throw new Error(`${label}はJSON配列として保存できません`);
    }
};

const normalizeTitleVariants = (aliasName: PatchValue, aliasReading: PatchValue)=>{
    const names = splitJoinedValues(aliasName);
    const readings = splitJoinedValues(aliasReading);
    return names.map((title, index)=>({
        title,
        reading: readings[index] ?? ""
    }));
};
const buildMagazineSearchFields = (input: {
    magazineId?: string;
    title?: string;
    reading?: string;
    publisherNames?: string[];
    titleVariants?: Array<{ title?: unknown; reading?: unknown }>;
})=>{
    const variants = input.titleVariants ?? [];
    const variantTitles = variants.map((variant)=>asString(variant.title).trim()).filter(Boolean);
    const variantReadings = variants.map((variant)=>asString(variant.reading).trim()).filter(Boolean);
    const publisherNames = input.publisherNames ?? [];
    return {
        searchText: [
            input.magazineId ?? "",
            input.title ?? "",
            input.reading ?? "",
            ...publisherNames,
            ...variantTitles,
            ...variantReadings
        ].map((value)=>String(value).trim()).filter(Boolean).join(" "),
        searchReading: [
            input.reading ?? "",
            ...variantReadings
        ].map((value)=>String(value).trim()).filter(Boolean).join(" ")
    };
};

const resolveRelatedMagazineRows = async (value: PatchValue)=>{
    const rows = normalizeJsonArray(value, "関連誌").map((row)=>{
        if (!row || typeof row !== "object") {
            return {
                role: "",
                name: "",
                reading: "",
                magazine_key: "",
                magazine_id: ""
            };
        }
        const record = row as Record<string, unknown>;
        return {
            role: String(record.role ?? record.relation ?? "").trim(),
            name: String(record.name ?? record.title ?? record.magazine_title ?? "").trim(),
            reading: String(record.reading ?? "").trim(),
            magazine_key: String(record.magazine_key ?? "").trim(),
            magazine_id: String(record.magazine_id ?? record.id ?? "").trim()
        };
    }).filter((row)=>row.role || row.name || row.reading || row.magazine_key || row.magazine_id);

    if (rows.length === 0) return [];

    const magazineKeys = Array.from(new Set(rows.map((row)=>row.magazine_key).filter(Boolean)));
    const magazineIds = Array.from(new Set(rows.map((row)=>row.magazine_id).filter(Boolean)));
    const conditions = [
        magazineKeys.length > 0 ? `mt.id in (${magazineKeys.map(sqlString).join(", ")})` : "",
        magazineIds.length > 0 ? `mt.magazine_id in (${magazineIds.map(sqlString).join(", ")})` : ""
    ].filter(Boolean);
    const resolvedRows = conditions.length > 0 ? await queryRows(`
select
  mt.id,
  mt.magazine_id,
  mt.title,
  mt.title_reading
from public.magazine_titles mt
where ${conditions.join(" or ")};
`) : [];
    const byKey = new Map(resolvedRows.map((row)=>[
            row.id ?? "",
            row
        ]));
    const byId = new Map(resolvedRows.map((row)=>[
            row.magazine_id ?? "",
            row
        ]));
    return rows.map((row)=>{
        const resolved = (row.magazine_key ? byKey.get(row.magazine_key) : undefined) ?? (row.magazine_id ? byId.get(row.magazine_id) : undefined);
        return {
            role: row.role,
            name: row.name || resolved?.title || "",
            reading: row.reading || resolved?.title_reading || "",
            magazine_key: resolved?.id ?? row.magazine_key,
            magazine_id: resolved?.magazine_id ?? row.magazine_id
        };
    });
};

type PublisherSelectionRow = {
    role: string;
    name: string;
    reading: string;
    publisherKey: string;
    publisherId: string;
};

const normalizePublisherSelections = (value: PatchValue): PublisherSelectionRow[]=>{
    const rows = normalizeJsonArray(value, "出版社").map((row)=>{
        if (!row || typeof row !== "object") return null;
        const record = row as Record<string, unknown>;
        const name = String(record.name ?? record.publisher_name ?? "").trim();
        const publisherKey = String(record.publisher_key ?? "").trim();
        const publisherId = String(record.publisher_id ?? record.id ?? "").trim();
        if (!name && !publisherKey && !publisherId) return null;
        return {
            role: String(record.role ?? "").trim(),
            name,
            reading: String(record.reading ?? record.publisher_reading ?? "").trim(),
            publisherKey,
            publisherId
        };
    }).filter((row): row is PublisherSelectionRow=>Boolean(row));
    if (rows.length === 0) throw new Error("出版社を1件以上選択してください");
    return rows;
};

const dedupePublisherSelections = (rows: PublisherSelectionRow[])=>{
    const seen = new Set<string>();
    return rows.filter((row)=>{
        const key = [
            row.publisherKey,
            row.publisherId,
            row.role,
            row.name
        ].join("::");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const toPatchSqlValue = (column: string, value: unknown)=>{
    if (value == null) return "null";
    if (Array.isArray(value)) {
        return column === "tags" ? sqlTextArray(value.map(String)) : sqlJson(value);
    }
    return sqlNullableText(String(value));
};

const rowToMagazineRecord = (row: Record<string, string | null>): MagazineMasterRecord=>{
    const variants = parseJson<TitleVariant[]>(row.title_variants_json, []);
    const aliasNames = variants.map((variant)=>asString(variant.title));
    const aliasReadings = variants.map((variant)=>asString(variant.reading));
    const publisherName = row.publisher_name ?? "出版社不明";
    const publisherReading = row.publisher_reading ?? "しゅっぱんしゃふめい";
    const publisherId = row.publisher_id ?? "P000000";
    const fallbackPublishers = [
        {
            role: "発行",
            name: publisherName,
            reading: publisherReading,
            publisher_key: row.publisher_key ?? "",
            publisher_id: publisherId
        }
    ];
    const storedPublishers = parseJson<Array<Record<string, unknown>>>(row.publishers_json, []);
    const publishers = JSON.stringify(storedPublishers.length > 0 ? storedPublishers : fallbackPublishers);
    return {
        id: row.magazine_id ?? "",
        internalId: row.id ?? "",
        name: row.title ?? "",
        reading: row.title_reading ?? "",
        aliasName: joinValues(aliasNames),
        aliasReading: joinValues(aliasReadings),
        publishers,
        publicationFrequency: parseJson<string[]>(row.publication_frequency_json, []),
        firstPublishedDate: row.first_published_date ?? "",
        closedDate: row.closed_date ?? "",
        issn: row.issn ?? "",
        jpno: row.jpno ?? "",
        relatedMagazines: row.related_magazines_json ?? "[]",
        relationNote: row.relation_note ?? "",
        memo: row.note ?? "",
        tag: parseJson<string[]>(row.tags_json, []),
        searchText: joinValues([
            row.search_text ?? "",
            row.issue_publisher_search_text ?? ""
        ]),
        updatedAt: row.updated_at ?? ""
    };
};

const buildApplicationMagazineRecord = (requestRow: {
    entityId: string;
    title: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
    requestId: string;
}): MagazineMasterRecord=>{
    const name = String(requestRow.metadata.name ?? requestRow.title ?? "").trim();
    const reading = String(requestRow.metadata.reading ?? "").trim();
    const publishers = Array.isArray(requestRow.metadata.publishers) ? requestRow.metadata.publishers : [];
    const publisherNames = publishers.map((row)=>{
        if (!row || typeof row !== "object") return "";
        return String((row as Record<string, unknown>).name ?? "").trim();
    }).filter(Boolean);
    const searchFields = buildMagazineSearchFields({
        magazineId: requestRow.entityId,
        title: name,
        reading,
        publisherNames,
        titleVariants: []
    });
    return {
        id: requestRow.entityId,
        internalId: `application:${requestRow.requestId}`,
        name,
        reading,
        aliasName: "",
        aliasReading: "",
        publishers: JSON.stringify(publishers),
        publicationFrequency: [],
        firstPublishedDate: "",
        closedDate: "",
        issn: "",
        jpno: "",
        relatedMagazines: "[]",
        relationNote: "",
        memo: "",
        tag: [],
        searchText: searchFields.searchText,
        updatedAt: requestRow.updatedAt
    };
};

const buildMagazineApplicationMetadataFromRecord = (record: MagazineMasterRecord)=>({
    name: record.name,
    reading: record.reading,
    titleVariants: normalizeTitleVariants(record.aliasName, record.aliasReading),
    publishers: parseJson<unknown[]>(record.publishers, []),
    publicationFrequency: record.publicationFrequency,
    firstPublishedDate: record.firstPublishedDate,
    closedDate: record.closedDate,
    issn: record.issn,
    jpno: record.jpno,
    relatedMagazines: parseJson<unknown[]>(record.relatedMagazines, []),
    relationNote: record.relationNote,
    memo: record.memo,
    tags: record.tag
});

const buildMagazineApplicationMetadata = (row: Record<string, string | null>)=>({
    ...buildMagazineApplicationMetadataFromRecord(rowToMagazineRecord(row))
});

const mergeMagazineRecordWithApplication = (
    record: MagazineMasterRecord,
    applicationRequest: {
        title: string;
        updatedAt: string;
        metadata: Record<string, unknown>;
    }
): MagazineMasterRecord=>{
    const titleVariants = Array.isArray(applicationRequest.metadata.titleVariants) ? applicationRequest.metadata.titleVariants : [];
    const aliasNames = titleVariants.map((variant)=>{
        if (!variant || typeof variant !== "object") return "";
        return String((variant as Record<string, unknown>).title ?? "").trim();
    }).filter(Boolean);
    const aliasReadings = titleVariants.map((variant)=>{
        if (!variant || typeof variant !== "object") return "";
        return String((variant as Record<string, unknown>).reading ?? "").trim();
    }).filter(Boolean);
    const publishers = Array.isArray(applicationRequest.metadata.publishers) ? applicationRequest.metadata.publishers : parseJson<unknown[]>(record.publishers, []);
    const nextName = String(applicationRequest.metadata.name ?? applicationRequest.title ?? record.name).trim() || record.name;
    const nextReading = String(applicationRequest.metadata.reading ?? record.reading).trim() || record.reading;
    const searchFields = buildMagazineSearchFields({
        magazineId: record.id,
        title: nextName,
        reading: nextReading,
        publisherNames: Array.isArray(publishers) ? publishers.map((row)=>{
            if (!row || typeof row !== "object") return "";
            return String((row as Record<string, unknown>).name ?? "").trim();
        }).filter(Boolean) : [],
        titleVariants: titleVariants.length > 0 ? titleVariants as TitleVariant[] : normalizeTitleVariants(record.aliasName, record.aliasReading)
    });
    return {
        ...record,
        name: nextName,
        reading: nextReading,
        aliasName: aliasNames.length > 0 ? joinValues(aliasNames) : record.aliasName,
        aliasReading: aliasReadings.length > 0 ? joinValues(aliasReadings) : record.aliasReading,
        publishers: JSON.stringify(publishers),
        publicationFrequency: Array.isArray(applicationRequest.metadata.publicationFrequency)
            ? applicationRequest.metadata.publicationFrequency.map((item)=>String(item).trim()).filter(Boolean)
            : record.publicationFrequency,
        firstPublishedDate: String(applicationRequest.metadata.firstPublishedDate ?? record.firstPublishedDate ?? ""),
        closedDate: String(applicationRequest.metadata.closedDate ?? record.closedDate ?? ""),
        issn: String(applicationRequest.metadata.issn ?? record.issn ?? ""),
        jpno: String(applicationRequest.metadata.jpno ?? record.jpno ?? ""),
        relatedMagazines: JSON.stringify(Array.isArray(applicationRequest.metadata.relatedMagazines) ? applicationRequest.metadata.relatedMagazines : parseJson<unknown[]>(record.relatedMagazines, [])),
        relationNote: String(applicationRequest.metadata.relationNote ?? record.relationNote ?? ""),
        memo: String(applicationRequest.metadata.memo ?? record.memo ?? ""),
        tag: Array.isArray(applicationRequest.metadata.tags) ? applicationRequest.metadata.tags.map((item)=>String(item).trim()).filter(Boolean) : record.tag,
        searchText: searchFields.searchText || record.searchText,
        updatedAt: applicationRequest.updatedAt || record.updatedAt
    };
};

const applyMagazinePatchToRecord = async (record: MagazineMasterRecord, field: string, value: PatchValue)=>{
    switch(field){
        case "name":
            return {
                ...record,
                name: normalizeRequiredText(value, "タイトル")
            };
        case "reading":
            return {
                ...record,
                reading: normalizeRequiredText(value, "読み")
            };
        case "aliasName":
            return {
                ...record,
                aliasName: String(value ?? "")
            };
        case "aliasReading":
            return {
                ...record,
                aliasReading: String(value ?? "")
            };
        case "publishers": {
            const publishers = await resolvePublisherSelections(value);
            return {
                ...record,
                publishers: JSON.stringify(publishers)
            };
        }
        case "publicationFrequency":
            return {
                ...record,
                publicationFrequency: normalizeStringArray(value)
            };
        case "firstPublishedDate":
            return {
                ...record,
                firstPublishedDate: normalizePartialDate(value, "創刊日")
            };
        case "closedDate":
            return {
                ...record,
                closedDate: normalizePartialDate(value, "終了日")
            };
        case "issn":
            return {
                ...record,
                issn: normalizeText(value)
            };
        case "jpno":
            return {
                ...record,
                jpno: normalizeText(value)
            };
        case "relatedMagazines":
            return {
                ...record,
                relatedMagazines: JSON.stringify(await resolveRelatedMagazineRows(value))
            };
        case "relationNote":
            return {
                ...record,
                relationNote: String(value ?? "")
            };
        case "memo":
            return {
                ...record,
                memo: String(value ?? "")
            };
        case "tag":
            return {
                ...record,
                tag: normalizeStringArray(value)
            };
        default:
            throw new Error("保存対象外の項目です");
    }
};

const resolvePublisherReference = async (selection: { publisherKey: string; publisherId: string })=>{
    if (selection.publisherKey && selection.publisherId) {
        return selection;
    }
    if (!selection.publisherKey && !selection.publisherId) {
        throw new Error("出版社を1件以上選択してください");
    }

    const whereClause = selection.publisherKey
        ? `p.id = ${sqlString(selection.publisherKey)}`
        : `p.publisher_id = ${sqlString(selection.publisherId)}`;
    const rows = await queryRows(`
select
  p.id,
  p.publisher_id
from public.publishers p
where ${whereClause}
limit 1;
`);
    const row = rows[0];
    if (!row?.id || !row?.publisher_id) {
        throw new Error("出版社参照を解決できませんでした");
    }
    return {
        publisherKey: row.id,
        publisherId: row.publisher_id
    };
};

const resolvePublisherSelections = async (value: PatchValue)=>{
    const rows = dedupePublisherSelections(normalizePublisherSelections(value));
    const publisherKeys = Array.from(new Set(rows.map((row)=>row.publisherKey).filter(Boolean)));
    const publisherIds = Array.from(new Set(rows.map((row)=>row.publisherId).filter(Boolean)));
    const conditions = [
        publisherKeys.length > 0 ? `p.id in (${publisherKeys.map(sqlString).join(", ")})` : "",
        publisherIds.length > 0 ? `p.publisher_id in (${publisherIds.map(sqlString).join(", ")})` : ""
    ].filter(Boolean);

    const resolvedRows = conditions.length > 0 ? await queryRows(`
select
  p.id,
  p.publisher_id,
  p.publisher_name,
  coalesce(p.publisher_reading, '') as publisher_reading
from public.publishers p
where ${conditions.join(" or ")};
`) : [];
    const byKey = new Map(resolvedRows.map((row)=>[
            row.id ?? "",
            row
        ]));
    const byId = new Map(resolvedRows.map((row)=>[
            row.publisher_id ?? "",
            row
        ]));
    const resolved = rows.map((row)=>{
        const matched = (row.publisherKey ? byKey.get(row.publisherKey) : undefined) ?? (row.publisherId ? byId.get(row.publisherId) : undefined);
        if (!matched?.id || !matched?.publisher_id) {
            throw new Error(`出版社参照を解決できませんでした: ${row.name || row.publisherId || row.publisherKey}`);
        }
        return {
            role: row.role || "発行",
            name: row.name || matched.publisher_name || "",
            reading: row.reading || matched.publisher_reading || "",
            publisher_key: matched.id,
            publisher_id: matched.publisher_id
        };
    });
    if (resolved.length === 0) throw new Error("出版社を1件以上選択してください");
    return resolved;
};

const findPublishedMagazinesByTitle = async (name: string)=>{
    const rows = await queryRows(`
select
${magazineTitleSelect}
${magazineTitleFromClause}
where mt.record_status = 'published'
  and mt.title = ${sqlString(name)}
order by mt.title_reading, mt.title, mt.magazine_id;
`);
    return rows.map(rowToMagazineRecord);
};

const getNextMagazineId = async ()=>{
    const rows = await queryRows(`
select coalesce(max(substring(magazine_id from 2)::integer), 0) + 1 as next_no
from public.magazine_titles
where magazine_id ~ '^M[0-9]+$';
`);
    const nextNo = Number(rows[0]?.next_no ?? "1");
    return `M${String(nextNo).padStart(6, "0")}`;
};

const loadMagazineDeleteDependencies = async (magazineKey: string, magazineId: string, title: string)=>{
    const [issueRows, relatedRows] = await Promise.all([
        queryRows(`
select count(distinct mi.magazine_issue_id)::integer as count
from public.magazine_issues mi
where mi.record_status <> 'deleted'
  and (
    mi.magazine_key = ${sqlString(magazineKey)}
    or mi.magazine_id = ${sqlString(magazineId)}
    or mi.issue_label like ${sqlString(`${title}(%`)}
  );
`),
        queryRows(`
select count(*)::integer as count
from public.magazine_titles mt
where mt.record_status <> 'deleted'
  and mt.id <> ${sqlString(magazineKey)}
  and (
    mt.related_magazines @> ${sqlJson([{ magazine_key: magazineKey }])}
    or mt.related_magazines @> ${sqlJson([{ magazine_id: magazineId }])}
    or mt.related_magazines @> ${sqlJson([{ name: title }])}
  );
`)
    ]);
    return [
        {
            label: "雑誌個別",
            count: Number(issueRows[0]?.count ?? 0)
        },
        {
            label: "関連誌",
            count: Number(relatedRows[0]?.count ?? 0)
        }
    ].filter((item)=>item.count > 0) as DeleteDependencyItem[];
};

const getPatchAssignments = async (field: string, value: PatchValue, beforeRow: Record<string, string | null>)=>{
    switch(field){
        case "name":
            return {
                title: normalizeRequiredText(value, "タイトル")
            };
        case "reading":
            return {
                title_reading: normalizeRequiredText(value, "読み")
            };
        case "aliasName":
            return {
                title_variants: normalizeTitleVariants(value, rowToMagazineRecord(beforeRow).aliasReading)
            };
        case "aliasReading":
            return {
                title_variants: normalizeTitleVariants(rowToMagazineRecord(beforeRow).aliasName, value)
            };
        case "publishers":
            {
                const resolved = await resolvePublisherSelections(value);
                const primary = resolved[0];
                return {
                    publishers: resolved,
                    publisher_key: primary.publisher_key,
                    publisher_id: primary.publisher_id
                };
            }
        case "publicationFrequency":
            return {
                publication_frequency: normalizeStringArray(value)
            };
        case "firstPublishedDate":
            return {
                first_published_date: normalizePartialDate(value, "創刊日")
            };
        case "closedDate":
            return {
                closed_date: normalizePartialDate(value, "休刊日")
            };
        case "issn":
            return {
                issn: normalizeText(value)
            };
        case "jpno":
            return {
                jpno: normalizeText(value)
            };
        case "relatedMagazines":
            return {
                related_magazines: await resolveRelatedMagazineRows(value)
            };
        case "relationNote":
            return {
                relation_note: String(value ?? "")
            };
        case "memo":
            return {
                note: String(value ?? "")
            };
        case "tag":
            return {
                tags: normalizeStringArray(value)
            };
        default:
            throw new Error("保存対象外の項目です");
    }
};

export async function GET(request: NextRequest) {
    try {
        const rows = await queryRows(`
select
${magazineTitleSelect}
${magazineTitleFromClause}
where mt.record_status = 'published'
order by mt.title_reading, mt.title, mt.magazine_id;
`);

        const records = rows.map(rowToMagazineRecord);
        const { items: applicationRequests } = await loadVisibleApplicationRequests(request, "magazine_title");
        const recordMap = new Map(records.map((record)=>[
                record.id,
                record
            ]));
        for (const applicationRequest of applicationRequests) {
            if (!applicationRequest.entityId) continue;
            const existingRecord = recordMap.get(applicationRequest.entityId);
            if (existingRecord) {
                recordMap.set(applicationRequest.entityId, mergeMagazineRecordWithApplication(existingRecord, applicationRequest));
                continue;
            }
            recordMap.set(applicationRequest.entityId, buildApplicationMagazineRecord(applicationRequest));
        }
        const mergedRecords = Array.from(recordMap.values()).sort((left, right)=>(
                (left.reading || left.name).localeCompare(right.reading || right.name, "ja")
                || left.name.localeCompare(right.name, "ja")
                || left.id.localeCompare(right.id, "ja")
            ));

        return NextResponse.json({
            records: mergedRecords
        });
    } catch (error) {
        return createRouteErrorResponse(error, "failed to load magazine titles", {
            databaseMessage: "データベースに接続できないため雑誌マスターを読み込めません。"
        });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PatchBody;
        const magazineKey = normalizeMagazineKey(body.magazineKey);
        const magazineId = normalizeMagazineId(body.magazineId);
        const field = String(body.field ?? "").trim();
        if (!magazineKey && !magazineId) {
            return NextResponse.json({
                error: "invalid magazine identifier"
            }, {
                status: 400
            });
        }
        if (!field) {
            return NextResponse.json({
                error: "field is required"
            }, {
                status: 400
            });
        }

const beforeRows = await queryRows(`
select
${magazineTitleSelect}
${magazineTitleFromClause}
where ${currentUser.role === "super_admin" ? "mt.record_status = 'published'" : "mt.record_status <> 'deleted'"}
  and ${magazineKey ? `mt.id = ${sqlString(magazineKey)}` : `mt.magazine_id = ${sqlString(magazineId)}`}
limit 1;
`);
        const beforeRow = beforeRows[0];
        if (!beforeRow) {
            return NextResponse.json({
                error: "magazine title not found"
            }, {
                status: 404
            });
        }
        if (currentUser.role !== "super_admin") {
            await ensureEditableRequestStatus(currentUser.id, beforeRow.magazine_id ?? magazineId);
        }

        const assignments: Record<string, unknown> = await getPatchAssignments(field, body.value ?? null, beforeRow);
        const nextTitle = String(assignments.title ?? beforeRow.title ?? "").trim();
        const nextReading = String(assignments.title_reading ?? beforeRow.title_reading ?? "").trim();
        const nextVariants = Array.isArray(assignments.title_variants)
            ? assignments.title_variants as TitleVariant[]
            : parseJson<TitleVariant[]>(beforeRow.title_variants_json, []);
        const nextPublishers = Array.isArray(assignments.publishers)
            ? assignments.publishers as Array<{ name?: unknown }>
            : parseJson<Array<{ name?: unknown }>>(beforeRow.publishers_json, []);
        const nextSearchFields = buildMagazineSearchFields({
            magazineId: beforeRow.magazine_id ?? "",
            title: nextTitle,
            reading: nextReading,
            publisherNames: nextPublishers.map((row)=>asString(row.name).trim()).filter(Boolean),
            titleVariants: nextVariants
        });
        assignments.search_text = nextSearchFields.searchText;
        assignments.search_reading = nextSearchFields.searchReading;
        const isPublishedSource = beforeRow.record_status === "published";
        if (currentUser.role !== "super_admin" && !isPublishedSource) {
            assignments.record_status = "draft";
            assignments.approved_at = null;
        }
        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        if (currentUser.role === "super_admin" || !isPublishedSource) {
            const setSql = Object.entries(assignments).map(([column, value])=>`${column} = ${toPatchSqlValue(column, value)}`).join(",\n  ");
            await queryRows(`
update public.magazine_titles
set
  ${setSql},
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(currentUser.id)}),
  updated_by = ${sqlAuthUserRef(currentUser.id)}
where id = ${sqlString(beforeRow.id ?? "")}
  and ${currentUser.role === "super_admin" ? "record_status = 'published'" : "record_status <> 'deleted'"}
returning magazine_id;
`);
        }

        const updatedRows = await queryRows(`
select
${magazineTitleSelect}
${magazineTitleFromClause}
where mt.id = ${sqlString(beforeRow.id ?? "")}
limit 1;
`);
        const updatedRow = updatedRows[0];
        const responseRecord = currentUser.role !== "super_admin" && isPublishedSource
            ? await applyMagazinePatchToRecord(rowToMagazineRecord(beforeRow), field, body.value ?? null)
            : updatedRow
                ? rowToMagazineRecord(updatedRow)
                : null;
        if (!responseRecord) throw new Error("updated magazine title could not be loaded");

        const responseMagazineId = responseRecord.id || beforeRow.magazine_id || "";
        const responseMagazineName = responseRecord.name || beforeRow.title || "";
        if (currentUser.role !== "super_admin") {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "magazine_title",
                entityId: responseMagazineId,
                title: responseMagazineName,
                parentLabel: "雑誌マスター",
                requestedAction: isPublishedSource ? "update" : "create",
                routePath: `/masters/magazines/${responseMagazineId}`,
                metadata: buildMagazineApplicationMetadataFromRecord(responseRecord),
            });
        }

        await queryRows(`
insert into public.audit_logs (
  action_type,
  target_table,
  target_id,
  target_label,
  before_data,
  after_data,
  actor_role,
  note
) values (
  'update',
  'magazine_titles',
  ${sqlString(responseMagazineId)},
  ${sqlString(responseRecord.name ?? "")},
  ${sqlJson({
            field,
            row: beforeRow
        })},
  ${sqlJson({
            field,
            assignments,
            row: updatedRow
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_save" : "editor_draft_save")}
);
`);

        return NextResponse.json({
            record: responseRecord
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: error.message
            }, {
                status: 400
            });
        }
        return createRouteErrorResponse(error, "failed to update magazine title", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PostBody;
        const name = normalizeRequiredText(String(body.name ?? ""), "タイトル");
        const reading = normalizeRequiredText(String(body.reading ?? ""), "読み");
        const resolvedPublishers = await resolvePublisherSelections(body.publishers as PatchValue);
        const primaryPublisher = resolvedPublishers[0];
        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const duplicates = await findPublishedMagazinesByTitle(name);
        if (duplicates.length > 0) {
            return NextResponse.json({
                error: "同じ雑誌名のマスターが存在します",
                duplicates
            }, {
                status: 409
            });
        }

        const magazineId = await getNextMagazineId();
        const magazineKey = createInternalId("mt");
        const searchFields = buildMagazineSearchFields({
            magazineId,
            title: name,
            reading,
            publisherNames: resolvedPublishers.map((row)=>row.name).filter(Boolean),
            titleVariants: []
        });
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
  ${sqlString(name)},
  ${sqlString(reading)},
  '[]'::jsonb,
  ${sqlJson(resolvedPublishers)},
  ${sqlString(primaryPublisher.publisher_id)},
  '[]'::jsonb,
  '',
  '',
  '',
  '[]'::jsonb,
  '',
  array[]::text[],
  ${sqlString(searchFields.searchText)},
  ${sqlString(searchFields.searchReading)},
  ${sqlString(currentUser.role === "super_admin" ? "published" : "draft")},
  ${sqlAuthUserRef(currentUser.id)},
  ${sqlAuthUserRef(currentUser.id)},
  ${sqlAuthUserRef(currentUser.id)},
  ${currentUser.role === "super_admin" ? sqlAuthUserRef(currentUser.id) : "null"},
  ${currentUser.role === "super_admin" ? "now()" : "null"}
);
`);

        const createdRows = await queryRows(`
select
${magazineTitleSelect}
${magazineTitleFromClause}
where mt.id = ${sqlString(magazineKey)}
limit 1;
`);
        const createdRow = createdRows[0];
        if (!createdRow) throw new Error("created magazine title could not be loaded");

        if (currentUser.role !== "super_admin") {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "magazine_title",
                entityId: magazineId,
                title: name,
                parentLabel: "雑誌マスター",
                requestedAction: "create",
                routePath: `/masters/magazines/${magazineId}`,
                metadata: buildMagazineApplicationMetadata(createdRow),
            });
        }

        await queryRows(`
insert into public.audit_logs (
  action_type,
  target_table,
  target_id,
  target_label,
  before_data,
  after_data,
  actor_role,
  note
) values (
  'create',
  'magazine_titles',
  ${sqlString(magazineId)},
  ${sqlString(name)},
  '{}'::jsonb,
  ${sqlJson({
            row: createdRow
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_create" : "editor_draft_create")}
);
`);

        return NextResponse.json({
            record: rowToMagazineRecord(createdRow)
        }, {
            status: 201
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: error.message
            }, {
                status: 400
            });
        }
        return createRouteErrorResponse(error, "failed to create magazine title", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as DeleteBody;
        const magazineKey = normalizeMagazineKey(body.magazineKey);
        const magazineId = normalizeMagazineId(body.magazineId);
        if (!magazineKey && !magazineId) {
            return NextResponse.json({
                error: "invalid magazine identifier"
            }, {
                status: 400
            });
        }

        const beforeRows = await queryRows(`
select
${magazineTitleSelect}
${magazineTitleFromClause}
where ${currentUser.role === "super_admin" ? "mt.record_status = 'published'" : "mt.record_status <> 'deleted'"}
  and ${magazineKey ? `mt.id = ${sqlString(magazineKey)}` : `mt.magazine_id = ${sqlString(magazineId)}`}
limit 1;
`);
        const beforeRow = beforeRows[0];
        if (!beforeRow) {
            return NextResponse.json({
                error: "magazine title not found"
            }, {
                status: 404
            });
        }
        if (currentUser.role !== "super_admin") {
            await ensureEditableRequestStatus(currentUser.id, beforeRow.magazine_id ?? magazineId);
        }

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const dependencies = await loadMagazineDeleteDependencies(beforeRow.id ?? "", beforeRow.magazine_id ?? "", beforeRow.title ?? "");
        if (dependencies.length > 0) {
            return NextResponse.json({
                error: "magazine title has dependencies",
                dependencies
            }, {
                status: 409
            });
        }

        if (currentUser.role === "super_admin") {
            await queryRows(`
update public.magazine_titles
set
  record_status = 'deleted',
  updated_by = ${sqlAuthUserRef(currentUser.id)},
  approved_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_at = now(),
  delete_reason = 'realtime_delete'
where id = ${sqlString(beforeRow.id ?? "")}
  and record_status = 'published'
returning magazine_id;
`);
        } else {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "magazine_title",
                entityId: beforeRow.magazine_id ?? "",
                title: beforeRow.title ?? "",
                parentLabel: "雑誌マスター",
                requestedAction: "delete",
                routePath: `/masters/magazines/${beforeRow.magazine_id ?? ""}`,
                metadata: buildMagazineApplicationMetadata(beforeRow),
            });
        }

        await queryRows(`
insert into public.audit_logs (
  action_type,
  target_table,
  target_id,
  target_label,
  before_data,
  after_data,
  actor_role,
  note
) values (
  'delete',
  'magazine_titles',
  ${sqlString(beforeRow.magazine_id ?? "")},
  ${sqlString(beforeRow.title ?? "")},
  ${sqlJson({
            row: beforeRow
        })},
  ${sqlJson({
            record_status: currentUser.role === "super_admin" ? "deleted" : "delete_requested"
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_delete" : "editor_delete_request")}
);
`);

        return NextResponse.json({
            deletedMagazineId: beforeRow.magazine_id ?? ""
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: error.message
            }, {
                status: 400
            });
        }
        return createRouteErrorResponse(error, "failed to delete magazine title", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}
