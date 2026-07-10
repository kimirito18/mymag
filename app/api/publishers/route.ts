import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { isApplicationRequestLocked, loadActiveApplicationRequest, upsertDraftApplicationRequest } from "@/app/lib/application-request-drafts";
import { loadVisibleApplicationRequests } from "@/app/lib/server-visible-application-requests";
import type { PublisherMasterRecord } from "@/app/lib/types";

export const runtime = "nodejs";

type PatchValue = string | string[] | null;
type PatchBody = {
    publisherKey?: unknown;
    publisherId?: unknown;
    field?: unknown;
    value?: PatchValue;
    debugDelayMs?: unknown;
};
type PostBody = {
    name?: unknown;
    reading?: unknown;
    debugDelayMs?: unknown;
};
type DeleteBody = {
    publisherKey?: unknown;
    publisherId?: unknown;
    debugDelayMs?: unknown;
};
type DeleteDependencyItem = {
    label: string;
    count: number;
};

class ValidationError extends Error {}

const ensureEditableRequestStatus = async (userId: string, entityId: string) => {
    const activeRequest = await loadActiveApplicationRequest(userId, "publisher", entityId);
    if (isApplicationRequestLocked(activeRequest?.status)) {
        throw new ValidationError("この出版社は申請中のため、編集中に戻すまで修正できません");
    }
};

const publisherSelect = `
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
  p.record_status,
  coalesce(p.edit_version::text, '') as edit_version,
  coalesce(p.updated_at::text, '') as updated_at`;

const parseJson = <T,>(value: string | null | undefined, fallback: T): T=>{
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const sqlAuthUserRef = (value: string | null | undefined)=>{
    const normalized = String(value ?? "").trim();
    if (!normalized) return "null";
    return `${sqlString(normalized)}::uuid`;
};
const sqlJson = (value: unknown)=>`${sqlString(JSON.stringify(value))}::jsonb`;
const sqlNullableText = (value: string | null)=>value == null ? "null" : sqlString(value);
const sqlNullableDate = (value: string | null)=>value == null ? "null" : `${sqlString(value)}::date`;
const sqlTextArray = (values: string[])=>`array[${values.map(sqlString).join(", ")}]::text[]`;
const sleep = (milliseconds: number)=>new Promise((resolve)=>setTimeout(resolve, milliseconds));
const buildSearchText = (name: string, reading: string)=>[
        name,
        reading,
        name
    ].filter(Boolean).join(" ").slice(0, 1000);

const normalizeDebugDelayMs = (value: unknown)=>{
    if (process.env.NODE_ENV === "production") return 0;
    const delay = Number(value);
    if (!Number.isFinite(delay) || delay <= 0) return 0;
    return Math.min(Math.round(delay), 5000);
};

const normalizePublisherId = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^P[0-9]+$/.test(normalized) ? normalized : "";
};

const normalizePublisherKey = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^pu_[0-9A-Za-z]+$/.test(normalized) ? normalized : "";
};

const normalizeRequiredText = (value: PatchValue, label: string)=>{
    const text = String(value ?? "").trim();
    if (!text) throw new ValidationError(`${label}は必須です`);
    return text;
};

const normalizeText = (value: PatchValue)=>String(value ?? "").trim();

const normalizeDate = (value: PatchValue, label: string)=>{
    const text = normalizeText(value);
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ValidationError(`${label}はYYYY-MM-DDで入力してください`);
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
        if (!Array.isArray(parsed)) throw new ValidationError(`${label}はJSON配列として保存できません`);
        return parsed;
    } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError(`${label}はJSON配列として保存できません`);
    }
};

const resolveRelatedPublisherRows = async (value: PatchValue)=>{
    const rows = normalizeJsonArray(value, "関連会社").map((row)=>{
        if (!row || typeof row !== "object") {
            return {
                role: "",
                name: "",
                publisher_key: "",
                publisher_id: ""
            };
        }
        const record = row as Record<string, unknown>;
        return {
            role: String(record.role ?? "").trim(),
            name: String(record.name ?? "").trim(),
            publisher_key: String(record.publisher_key ?? "").trim(),
            publisher_id: String(record.publisher_id ?? record.id ?? "").trim()
        };
    }).filter((row)=>row.role || row.name || row.publisher_key || row.publisher_id);

    if (rows.length === 0) return [];

    const publisherKeys = Array.from(new Set(rows.map((row)=>row.publisher_key).filter(Boolean)));
    const publisherIds = Array.from(new Set(rows.map((row)=>row.publisher_id).filter(Boolean)));
    const conditions = [
        publisherKeys.length > 0 ? `p.id in (${publisherKeys.map(sqlString).join(", ")})` : "",
        publisherIds.length > 0 ? `p.publisher_id in (${publisherIds.map(sqlString).join(", ")})` : ""
    ].filter(Boolean);
    const resolvedRows = conditions.length > 0 ? await queryRows(`
select
  p.id,
  p.publisher_id,
  p.publisher_name
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
    return rows.map((row)=>{
        const resolved = (row.publisher_key ? byKey.get(row.publisher_key) : undefined) ?? (row.publisher_id ? byId.get(row.publisher_id) : undefined);
        return {
            role: row.role,
            name: row.name || resolved?.publisher_name || "",
            publisher_key: resolved?.id ?? row.publisher_key,
            publisher_id: resolved?.publisher_id ?? row.publisher_id
        };
    });
};

const rowToPublisherRecord = (row: Record<string, string | null>): PublisherMasterRecord=>({
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
    updatedAt: row.updated_at ?? ""
});

const buildPublisherApplicationMetadataFromRecord = (record: PublisherMasterRecord)=>({
    name: record.name,
    reading: record.reading,
    address: record.address,
    url: record.url,
    relatedLink: parseJson<unknown[]>(record.relatedLink, []),
    startDate: record.startDate,
    endDate: record.endDate,
    memo: record.memo,
    relatedPublishers: parseJson<unknown[]>(record.relatedPublishers, []),
    tags: record.tag
});

const buildPublisherApplicationMetadata = (row: Record<string, string | null>)=>({
    ...buildPublisherApplicationMetadataFromRecord(rowToPublisherRecord(row))
});

const buildApplicationPublisherRecord = (requestRow: {
    entityId: string;
    title: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
    requestId: string;
}): PublisherMasterRecord=>({
    id: requestRow.entityId,
    internalId: `application:${requestRow.requestId}`,
    name: String(requestRow.metadata.name ?? requestRow.title ?? "").trim(),
    reading: String(requestRow.metadata.reading ?? "").trim(),
    address: String(requestRow.metadata.address ?? "").trim(),
    url: String(requestRow.metadata.url ?? "").trim(),
    relatedLink: JSON.stringify(Array.isArray(requestRow.metadata.relatedLink) ? requestRow.metadata.relatedLink : []),
    startDate: String(requestRow.metadata.startDate ?? "").trim(),
    endDate: String(requestRow.metadata.endDate ?? "").trim(),
    memo: String(requestRow.metadata.memo ?? "").trim(),
    relatedPublishers: JSON.stringify(Array.isArray(requestRow.metadata.relatedPublishers) ? requestRow.metadata.relatedPublishers : []),
    tag: parseJson<string[]>(JSON.stringify(Array.isArray(requestRow.metadata.tags) ? requestRow.metadata.tags : []), []),
    searchText: [
        requestRow.entityId,
        String(requestRow.metadata.name ?? requestRow.title ?? "").trim(),
        String(requestRow.metadata.reading ?? "").trim()
    ].filter(Boolean).join(" "),
    updatedAt: requestRow.updatedAt
});

const mergePublisherRecordWithApplication = (
    record: PublisherMasterRecord,
    applicationRequest: {
        title: string;
        updatedAt: string;
        metadata: Record<string, unknown>;
    }
): PublisherMasterRecord=>({
    ...record,
    name: String(applicationRequest.metadata.name ?? applicationRequest.title ?? record.name).trim() || record.name,
    reading: String(applicationRequest.metadata.reading ?? record.reading).trim() || record.reading,
    address: String(applicationRequest.metadata.address ?? record.address ?? ""),
    url: String(applicationRequest.metadata.url ?? record.url ?? ""),
    relatedLink: JSON.stringify(Array.isArray(applicationRequest.metadata.relatedLink) ? applicationRequest.metadata.relatedLink : parseJson<unknown[]>(record.relatedLink, [])),
    startDate: String(applicationRequest.metadata.startDate ?? record.startDate ?? ""),
    endDate: String(applicationRequest.metadata.endDate ?? record.endDate ?? ""),
    memo: String(applicationRequest.metadata.memo ?? record.memo ?? ""),
    relatedPublishers: JSON.stringify(Array.isArray(applicationRequest.metadata.relatedPublishers) ? applicationRequest.metadata.relatedPublishers : parseJson<unknown[]>(record.relatedPublishers, [])),
    tag: Array.isArray(applicationRequest.metadata.tags) ? applicationRequest.metadata.tags.map((tag)=>String(tag).trim()).filter(Boolean) : record.tag,
    searchText: [
        record.id,
        String(applicationRequest.metadata.name ?? applicationRequest.title ?? record.name).trim() || record.name,
        String(applicationRequest.metadata.reading ?? record.reading).trim() || record.reading
    ].filter(Boolean).join(" ").trim(),
    updatedAt: applicationRequest.updatedAt || record.updatedAt
});

const applyPublisherPatchToRecord = async (record: PublisherMasterRecord, field: string, value: PatchValue)=>{
    switch(field){
        case "name":
            return {
                ...record,
                name: normalizeRequiredText(value, "出版社名")
            };
        case "reading":
            return {
                ...record,
                reading: normalizeRequiredText(value, "読み")
            };
        case "address":
            return {
                ...record,
                address: String(value ?? "")
            };
        case "url":
            return {
                ...record,
                url: normalizeText(value)
            };
        case "relatedLink":
            return {
                ...record,
                relatedLink: JSON.stringify(normalizeJsonArray(value, "関連URL"))
            };
        case "startDate":
            return {
                ...record,
                startDate: normalizeDate(value, "設立日") ?? ""
            };
        case "endDate":
            return {
                ...record,
                endDate: normalizeDate(value, "終了日") ?? ""
            };
        case "memo":
            return {
                ...record,
                memo: String(value ?? "")
            };
        case "relatedPublishers":
            return {
                ...record,
                relatedPublishers: JSON.stringify(await resolveRelatedPublisherRows(value))
            };
        case "tag":
            return {
                ...record,
                tag: normalizeStringArray(value)
            };
        default:
            throw new ValidationError("保存対象外の項目です");
    }
};

const toPatchSqlValue = (column: string, value: unknown)=>{
    if (value == null) return "null";
    if (Array.isArray(value)) return column === "tags" ? sqlTextArray(value.map(String)) : sqlJson(value);
    if (column === "start_date" || column === "end_date") return sqlNullableDate(String(value));
    return sqlNullableText(String(value));
};

const getPatchAssignments = async (field: string, value: PatchValue, beforeRow: Record<string, string | null>)=>{
    switch(field){
        case "name": {
            const name = normalizeRequiredText(value, "出版社名");
            return {
                publisher_name: name,
                search_text: buildSearchText(name, beforeRow.publisher_reading ?? "")
            };
        }
        case "reading": {
            const reading = normalizeRequiredText(value, "読み");
            return {
                publisher_reading: reading,
                search_text: buildSearchText(beforeRow.publisher_name ?? "", reading)
            };
        }
        case "address":
            return {
                address: String(value ?? "")
            };
        case "url":
            return {
                url: normalizeText(value)
            };
        case "relatedLink":
            return {
                related_link: normalizeJsonArray(value, "関連URL")
            };
        case "startDate":
            return {
                start_date: normalizeDate(value, "設立日")
            };
        case "endDate":
            return {
                end_date: normalizeDate(value, "終了日")
            };
        case "memo":
            return {
                memo: String(value ?? "")
            };
        case "relatedPublishers":
            return {
                related_publishers: await resolveRelatedPublisherRows(value)
            };
        case "tag":
            return {
                tags: normalizeStringArray(value)
            };
        default:
            throw new ValidationError("保存対象外の項目です");
    }
};

const getNextPublisherId = async ()=>{
    const rows = await queryRows(`
select coalesce(max(substring(publisher_id from 2)::integer), 0) + 1 as next_no
from public.publishers
where publisher_id ~ '^P[0-9]+$';
`);
    const nextNo = Number(rows[0]?.next_no ?? "1");
    return `P${String(nextNo).padStart(6, "0")}`;
};

const findPublishedPublishersByName = async (name: string)=>{
    const rows = await queryRows(`
select
${publisherSelect}
from public.publishers p
where p.record_status = 'published'
  and p.publisher_name = ${sqlString(name)}
order by p.publisher_reading, p.publisher_name, p.publisher_id;
`);
    return rows.map(rowToPublisherRecord);
};

const loadPublisherDeleteDependencies = async (publisherKey: string, publisherId: string)=>{
    const [magazineTitleRows, issueRows, relatedPublisherRows] = await Promise.all([
        queryRows(`
select count(*)::integer as count
from public.magazine_titles mt
where mt.record_status = 'published'
  and mt.publisher_key = ${sqlString(publisherKey)};
`),
        queryRows(`
select count(*)::integer as count
from public.magazine_issues mi
where mi.record_status = 'published'
  and (
    mi.publisher_key = ${sqlString(publisherKey)}
    or mi.publishers @> ${sqlJson([{ publisher_key: publisherKey }])}
    or mi.publishers @> ${sqlJson([{ publisher_id: publisherId }])}
  );
`),
        queryRows(`
select count(*)::integer as count
from public.publishers p
where p.record_status = 'published'
  and p.id <> ${sqlString(publisherKey)}
  and (
    p.related_publishers @> ${sqlJson([{ publisher_key: publisherKey }])}
    or p.related_publishers @> ${sqlJson([{ publisher_id: publisherId }])}
  );
`)
    ]);
    return [
        {
            label: "雑誌マスター",
            count: Number(magazineTitleRows[0]?.count ?? 0)
        },
        {
            label: "雑誌個別",
            count: Number(issueRows[0]?.count ?? 0)
        },
        {
            label: "関連会社",
            count: Number(relatedPublisherRows[0]?.count ?? 0)
        }
    ].filter((item)=>item.count > 0) as DeleteDependencyItem[];
};

export async function GET(request: NextRequest) {
    try {
        const rows = await queryRows(`
select
${publisherSelect}
from public.publishers p
where p.record_status = 'published'
order by p.publisher_reading, p.publisher_name, p.publisher_id;
`);
        const records = rows.map(rowToPublisherRecord);
        const { items: applicationRequests } = await loadVisibleApplicationRequests(request, "publisher");
        const recordMap = new Map(records.map((record)=>[
                record.id,
                record
            ]));
        for (const applicationRequest of applicationRequests) {
            if (!applicationRequest.entityId) continue;
            const existingRecord = recordMap.get(applicationRequest.entityId);
            if (existingRecord) {
                recordMap.set(applicationRequest.entityId, mergePublisherRecordWithApplication(existingRecord, applicationRequest));
                continue;
            }
            recordMap.set(applicationRequest.entityId, buildApplicationPublisherRecord(applicationRequest));
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
        return createRouteErrorResponse(error, "failed to load publishers", {
            databaseMessage: "データベースに接続できないため出版社マスターを読み込めません。"
        });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PatchBody;
        const publisherKey = normalizePublisherKey(body.publisherKey);
        const publisherId = normalizePublisherId(body.publisherId);
        const field = String(body.field ?? "").trim();
        if (!publisherKey && !publisherId) {
            return NextResponse.json({
                error: "invalid publisher identifier"
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
${publisherSelect}
from public.publishers p
where ${currentUser.role === "super_admin" ? "p.record_status = 'published'" : "p.record_status <> 'deleted'"}
  and ${publisherKey ? `p.id = ${sqlString(publisherKey)}` : `p.publisher_id = ${sqlString(publisherId)}`}
limit 1;
`);
        const beforeRow = beforeRows[0];
        if (!beforeRow) {
            return NextResponse.json({
                error: "publisher not found"
            }, {
                status: 404
            });
        }
        if (currentUser.role !== "super_admin") {
            await ensureEditableRequestStatus(currentUser.id, beforeRow.publisher_id ?? publisherId);
        }

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const isPublishedSource = beforeRow.record_status === "published";
        const assignments: Record<string, unknown> = await getPatchAssignments(field, body.value ?? null, beforeRow);
        if (currentUser.role !== "super_admin" && !isPublishedSource) {
            assignments.record_status = "draft";
            assignments.approved_at = null;
        }
        if (currentUser.role === "super_admin" || !isPublishedSource) {
            const setSql = Object.entries(assignments).map(([column, value])=>`${column} = ${toPatchSqlValue(column, value)}`).join(",\n  ");
            await queryRows(`
update public.publishers
set
  ${setSql},
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(currentUser.id)}),
  updated_by = ${sqlAuthUserRef(currentUser.id)}
where id = ${sqlString(beforeRow.id ?? "")}
  and ${currentUser.role === "super_admin" ? "record_status = 'published'" : "record_status <> 'deleted'"}
returning publisher_id;
`);
        }

        const updatedRows = await queryRows(`
select
${publisherSelect}
from public.publishers p
where p.id = ${sqlString(beforeRow.id ?? "")}
limit 1;
`);
        const updatedRow = updatedRows[0];
        const responseRecord = currentUser.role !== "super_admin" && isPublishedSource
            ? await applyPublisherPatchToRecord(rowToPublisherRecord(beforeRow), field, body.value ?? null)
            : updatedRow
                ? rowToPublisherRecord(updatedRow)
                : null;
        if (!responseRecord) throw new Error("updated publisher could not be loaded");

        const responsePublisherId = responseRecord.id || beforeRow.publisher_id || "";
        const responsePublisherName = responseRecord.name || beforeRow.publisher_name || "";
        if (currentUser.role !== "super_admin") {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "publisher",
                entityId: responsePublisherId,
                title: responsePublisherName,
                parentLabel: "出版社マスター",
                requestedAction: isPublishedSource ? "update" : "create",
                routePath: `/masters/publishers/${responsePublisherId}`,
                metadata: buildPublisherApplicationMetadataFromRecord(responseRecord),
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
  'publishers',
  ${sqlString(responsePublisherId)},
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
        return createRouteErrorResponse(error, "failed to update publisher", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PostBody;
        const name = normalizeRequiredText(String(body.name ?? ""), "出版社名");
        const reading = normalizeRequiredText(String(body.reading ?? ""), "読み");
        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const duplicates = await findPublishedPublishersByName(name);
        if (duplicates.length > 0) {
            return NextResponse.json({
                error: "同じ出版社名のマスターが存在します",
                duplicates
            }, {
                status: 409
            });
        }

        const publisherId = await getNextPublisherId();
        const publisherKey = createInternalId("pu");
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
  ${sqlString(name)},
  ${sqlString(reading)},
  '',
  '',
  '[]'::jsonb,
  '',
  '[]'::jsonb,
  array[]::text[],
  ${sqlString(buildSearchText(name, reading))},
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
${publisherSelect}
from public.publishers p
where p.publisher_id = ${sqlString(publisherId)}
limit 1;
`);
        const createdRow = createdRows[0];
        if (!createdRow) throw new Error("created publisher could not be loaded");

        if (currentUser.role !== "super_admin") {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "publisher",
                entityId: publisherId,
                title: name,
                parentLabel: "出版社マスター",
                requestedAction: "create",
                routePath: `/masters/publishers/${publisherId}`,
                metadata: buildPublisherApplicationMetadata(createdRow),
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
  'publishers',
  ${sqlString(publisherId)},
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
            record: rowToPublisherRecord(createdRow)
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
        return createRouteErrorResponse(error, "failed to create publisher", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as DeleteBody;
        const publisherKey = normalizePublisherKey(body.publisherKey);
        const publisherId = normalizePublisherId(body.publisherId);
        if (!publisherKey && !publisherId) {
            return NextResponse.json({
                error: "invalid publisher identifier"
            }, {
                status: 400
            });
        }

const beforeRows = await queryRows(`
select
${publisherSelect}
from public.publishers p
where ${currentUser.role === "super_admin" ? "p.record_status = 'published'" : "p.record_status <> 'deleted'"}
  and ${publisherKey ? `p.id = ${sqlString(publisherKey)}` : `p.publisher_id = ${sqlString(publisherId)}`}
limit 1;
`);
        const beforeRow = beforeRows[0];
        if (!beforeRow) {
            return NextResponse.json({
                error: "publisher not found"
            }, {
                status: 404
            });
        }
        if (currentUser.role !== "super_admin") {
            await ensureEditableRequestStatus(currentUser.id, beforeRow.publisher_id ?? publisherId);
        }

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const dependencies = await loadPublisherDeleteDependencies(beforeRow.id ?? "", beforeRow.publisher_id ?? "");
        if (dependencies.length > 0) {
            return NextResponse.json({
                error: "publisher has dependencies",
                dependencies
            }, {
                status: 409
            });
        }

        if (currentUser.role === "super_admin") {
            await queryRows(`
update public.publishers
set
  record_status = 'deleted',
  updated_by = ${sqlAuthUserRef(currentUser.id)},
  approved_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_at = now(),
  delete_reason = 'realtime_delete'
where id = ${sqlString(beforeRow.id ?? "")}
  and record_status = 'published'
returning publisher_id;
`);
        } else {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "publisher",
                entityId: beforeRow.publisher_id ?? "",
                title: beforeRow.publisher_name ?? "",
                parentLabel: "出版社マスター",
                requestedAction: "delete",
                routePath: `/masters/publishers/${beforeRow.publisher_id ?? ""}`,
                metadata: buildPublisherApplicationMetadata(beforeRow),
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
  'publishers',
  ${sqlString(beforeRow.publisher_id ?? "")},
  ${sqlString(beforeRow.publisher_name ?? "")},
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
            deletedPublisherId: beforeRow.publisher_id ?? ""
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: error.message
            }, {
                status: 400
            });
        }
        return createRouteErrorResponse(error, "failed to delete publisher", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}
