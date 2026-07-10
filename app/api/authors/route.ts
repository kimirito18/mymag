import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { isApplicationRequestLocked, loadActiveApplicationRequest, upsertDraftApplicationRequest } from "@/app/lib/application-request-drafts";
import { loadVisibleApplicationRequests } from "@/app/lib/server-visible-application-requests";
import type { AuthorAliasEntry, AuthorMasterRecord } from "@/app/lib/types";

export const runtime = "nodejs";

type PatchValue = string | string[] | null;
type PatchBody = {
    authorKey?: unknown;
    authorId?: unknown;
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
    authorKey?: unknown;
    authorId?: unknown;
    debugDelayMs?: unknown;
};
type DeleteDependencyItem = {
    label: string;
    count: number;
};

class ValidationError extends Error {}

const ensureEditableRequestStatus = async (userId: string, entityId: string) => {
    const activeRequest = await loadActiveApplicationRequest(userId, "author", entityId);
    if (isApplicationRequestLocked(activeRequest?.status)) {
        throw new ValidationError("この著者は申請中のため、編集中に戻すまで修正できません");
    }
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
  a.record_status,
  coalesce(a.edit_version::text, '') as edit_version,
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

const normalizeAuthorId = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^A[0-9]+$/.test(normalized) ? normalized : "";
};

const normalizeAuthorKey = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^au_[0-9A-Za-z]+$/.test(normalized) ? normalized : "";
};

const normalizeRequiredText = (value: PatchValue, label: string)=>{
    const text = String(value ?? "").trim();
    if (!text) throw new ValidationError(`${label}は必須です`);
    return text;
};

const normalizeHiraganaReading = (value: PatchValue, label: string)=>{
    const text = normalizeRequiredText(value, label);
    if (!/^[ぁ-ゖー]+$/.test(text)) {
        throw new ValidationError(`${label}はひらがなと長音「ー」のみで入力してください`);
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
        if (!Array.isArray(parsed)) throw new ValidationError(`${label}はJSON配列として保存できません`);
        return parsed;
    } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError(`${label}はJSON配列として保存できません`);
    }
};

const normalizeAliasRows = (value: PatchValue)=>{
    const rows = normalizeJsonArray(value, "別名義");
    return rows.map((row)=>{
        if (!row || typeof row !== "object") return null;
        const record = row as Record<string, unknown>;
        return {
            name: String(record.name ?? "").trim(),
            author_key: String(record.author_key ?? "").trim(),
            author_id: String(record.author_id ?? record.id ?? "").trim()
        };
    }).filter((row)=>Boolean(row?.name || row?.author_id)) as AuthorAliasEntry[];
};

const rowToAuthorRecord = (row: Record<string, string | null>): AuthorMasterRecord=>({
    id: row.author_id ?? "",
    internalId: row.id ?? "",
    name: row.author_name ?? "",
    reading: row.author_reading ?? "",
    otherAuthorIds: row.aliases_json ?? "[]",
    socialLinks: row.social_links_json ?? "[]",
    memo: row.memo ?? "",
    tag: parseJson<string[]>(row.tags_json, []),
    searchText: row.search_text ?? "",
    updatedAt: row.updated_at ?? ""
});

const buildAuthorApplicationMetadataFromRecord = (record: AuthorMasterRecord)=>({
    name: record.name,
    reading: record.reading,
    otherAuthorIds: parseJson<unknown[]>(record.otherAuthorIds, []),
    socialLinks: parseJson<unknown[]>(record.socialLinks, []),
    memo: record.memo,
    tags: record.tag
});

const buildAuthorApplicationMetadata = (row: Record<string, string | null>)=>({
    ...buildAuthorApplicationMetadataFromRecord(rowToAuthorRecord(row))
});

const buildApplicationAuthorRecord = (requestRow: {
    entityId: string;
    title: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
    requestId: string;
}): AuthorMasterRecord=>({
    id: requestRow.entityId,
    internalId: `application:${requestRow.requestId}`,
    name: String(requestRow.metadata.name ?? requestRow.title ?? "").trim(),
    reading: String(requestRow.metadata.reading ?? "").trim(),
    otherAuthorIds: JSON.stringify(Array.isArray(requestRow.metadata.otherAuthorIds) ? requestRow.metadata.otherAuthorIds : []),
    socialLinks: JSON.stringify(Array.isArray(requestRow.metadata.socialLinks) ? requestRow.metadata.socialLinks : []),
    memo: String(requestRow.metadata.memo ?? "").trim(),
    tag: parseJson<string[]>(JSON.stringify(Array.isArray(requestRow.metadata.tags) ? requestRow.metadata.tags : []), []),
    searchText: [
        requestRow.entityId,
        String(requestRow.metadata.name ?? requestRow.title ?? "").trim(),
        String(requestRow.metadata.reading ?? "").trim()
    ].filter(Boolean).join(" "),
    updatedAt: requestRow.updatedAt
});

const mergeAuthorRecordWithApplication = (
    record: AuthorMasterRecord,
    applicationRequest: {
        title: string;
        updatedAt: string;
        metadata: Record<string, unknown>;
    }
): AuthorMasterRecord=>({
    ...record,
    name: String(applicationRequest.metadata.name ?? applicationRequest.title ?? record.name).trim() || record.name,
    reading: String(applicationRequest.metadata.reading ?? record.reading).trim() || record.reading,
    otherAuthorIds: JSON.stringify(Array.isArray(applicationRequest.metadata.otherAuthorIds) ? applicationRequest.metadata.otherAuthorIds : parseJson<unknown[]>(record.otherAuthorIds, [])),
    socialLinks: JSON.stringify(Array.isArray(applicationRequest.metadata.socialLinks) ? applicationRequest.metadata.socialLinks : parseJson<unknown[]>(record.socialLinks, [])),
    memo: String(applicationRequest.metadata.memo ?? record.memo ?? ""),
    tag: Array.isArray(applicationRequest.metadata.tags) ? applicationRequest.metadata.tags.map((tag)=>String(tag).trim()).filter(Boolean) : record.tag,
    searchText: [
        record.id,
        String(applicationRequest.metadata.name ?? applicationRequest.title ?? record.name).trim() || record.name,
        String(applicationRequest.metadata.reading ?? record.reading).trim() || record.reading
    ].filter(Boolean).join(" ").trim(),
    updatedAt: applicationRequest.updatedAt || record.updatedAt
});

const applyAuthorPatchToRecord = (record: AuthorMasterRecord, field: string, value: PatchValue)=>{
    switch(field){
        case "name":
            return {
                ...record,
                name: normalizeRequiredText(value, "著者名")
            };
        case "reading":
            return {
                ...record,
                reading: normalizeHiraganaReading(value, "読み")
            };
        case "socialLinks":
            return {
                ...record,
                socialLinks: JSON.stringify(normalizeJsonArray(value, "SNS"))
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
        case "otherAuthorIds":
            return {
                ...record,
                otherAuthorIds: JSON.stringify(normalizeAliasRows(value))
            };
        default:
            throw new ValidationError("保存対象外の項目です");
    }
};

const toPatchSqlValue = (column: string, value: unknown)=>{
    if (value == null) return "null";
    if (Array.isArray(value)) return column === "tags" ? sqlTextArray(value.map(String)) : sqlJson(value);
    return sqlNullableText(String(value));
};

const getPatchAssignments = (field: string, value: PatchValue, beforeRow: Record<string, string | null>)=>{
    switch(field){
        case "name": {
            const name = normalizeRequiredText(value, "著者名");
            return {
                author_name: name,
                search_text: buildSearchText(name, beforeRow.author_reading ?? "")
            };
        }
        case "reading": {
            const reading = normalizeHiraganaReading(value, "読み");
            return {
                author_reading: reading,
                search_text: buildSearchText(beforeRow.author_name ?? "", reading)
            };
        }
        case "socialLinks":
            return {
                social_links: normalizeJsonArray(value, "SNS")
            };
        case "memo":
            return {
                memo: String(value ?? "")
            };
        case "tag":
            return {
                tags: normalizeStringArray(value)
            };
        default:
            throw new ValidationError("保存対象外の項目です");
    }
};

const getNextAuthorId = async ()=>{
    const rows = await queryRows(`
select coalesce(max(substring(author_id from 2)::integer), 0) + 1 as next_no
from public.authors
where author_id ~ '^A[0-9]+$';
`);
    const nextNo = Number(rows[0]?.next_no ?? "1");
    return `A${String(nextNo).padStart(6, "0")}`;
};

const findPublishedAuthorsByName = async (name: string)=>{
    const rows = await queryRows(`
select
${authorSelect}
${authorFromClause}
where a.record_status = 'published'
  and a.author_name = ${sqlString(name)}
order by a.author_reading, a.author_name, a.author_id;
`);
    return rows.map(rowToAuthorRecord);
};

const loadAuthorDeleteDependencies = async (authorKey: string, authorId: string)=>{
    const [aliasRows, storyRows, issueRows] = await Promise.all([
        queryRows(`
select count(*)::integer as count
from public.author_alias_links
where author_key_1 = ${sqlString(authorKey)}
   or author_key_2 = ${sqlString(authorKey)}
   or author_id_1 = ${sqlString(authorId)}
   or author_id_2 = ${sqlString(authorId)};
`),
        queryRows(`
select count(*)::integer as count
from public.stories s
where s.record_status = 'published'
  and coalesce(s.status, '') <> 'deleted'
  and s.contributors @> ${sqlJson([{ author_id: authorId }])};
`),
        queryRows(`
select count(distinct mi.magazine_issue_id)::integer as count
from public.magazine_issues mi
where mi.record_status = 'published'
  and exists (
    select 1
    from jsonb_array_elements(mi.contents) as content
    where exists (
      select 1
      from jsonb_array_elements(coalesce(content->'contributors', '[]'::jsonb)) as contributor
      where contributor->>'author_id' = ${sqlString(authorId)}
    )
  );
`)
    ]);
    return [
        {
            label: "別名義リンク",
            count: Number(aliasRows[0]?.count ?? 0)
        },
        {
            label: "作品リスト story",
            count: Number(storyRows[0]?.count ?? 0)
        },
        {
            label: "雑誌個別コンテンツ",
            count: Number(issueRows[0]?.count ?? 0)
        }
    ].filter((item)=>item.count > 0) as DeleteDependencyItem[];
};

const pairAliasIds = (authorId: string, aliasId: string)=>{
    if (authorId === aliasId) throw new ValidationError("自分自身は別名義に追加できません");
    return authorId < aliasId ? [authorId, aliasId] : [aliasId, authorId];
};

const saveAuthorAliases = async (authorId: string, aliases: AuthorAliasEntry[])=>{
    const aliasIds = Array.from(new Set(aliases.map((alias)=>alias.author_id).filter(Boolean)));
    if (aliasIds.length === 0) {
        await queryRows(`
delete from public.author_alias_links
where author_id_1 = ${sqlString(authorId)}
   or author_id_2 = ${sqlString(authorId)};
`);
        return;
    }

    const existingRows = await queryRows(`
select author_id, id
from public.authors
where record_status = 'published'
  and author_id in (${[
        authorId,
        ...aliasIds
    ].map(sqlString).join(", ")});
`);
    const existingIds = new Set(existingRows.map((row)=>row.author_id ?? ""));
    const authorKeyById = new Map(existingRows.map((row)=>[
            row.author_id ?? "",
            row.id ?? ""
        ]));
    const missingIds = aliasIds.filter((aliasId)=>!existingIds.has(aliasId));
    if (missingIds.length > 0) {
        throw new ValidationError(`存在しない著者IDは別名義に追加できません: ${missingIds.join(", ")}`);
    }
    const authorKey = authorKeyById.get(authorId) ?? "";
    if (!authorKey) throw new ValidationError("現在の著者内部キーを取得できませんでした");

    const pairs = Array.from(new Set(aliasIds.map((aliasId)=>{
        const [leftId, rightId] = pairAliasIds(authorId, aliasId);
        const aliasKey = authorKeyById.get(aliasId) ?? "";
        if (!aliasKey) {
            throw new ValidationError(`著者内部キーを取得できませんでした: ${aliasId}`);
        }
        const [leftKey, rightKey] = authorKey < aliasKey ? [
            authorKey,
            aliasKey
        ] : [
            aliasKey,
            authorKey
        ];
        return JSON.stringify({
            leftId,
            rightId,
            leftKey,
            rightKey
        });
    }))).map((pair)=>JSON.parse(pair) as {
            leftId: string;
            rightId: string;
            leftKey: string;
            rightKey: string;
        });
    const valuesSql = pairs.map(({ leftId, rightId, leftKey, rightKey })=>`(${sqlString(leftId)}, ${sqlString(rightId)}, ${sqlString(leftKey)}, ${sqlString(rightKey)}, 'alias')`).join(",\n");
    await queryRows(`
delete from public.author_alias_links
where author_id_1 = ${sqlString(authorId)}
   or author_id_2 = ${sqlString(authorId)};

insert into public.author_alias_links (
  author_id_1,
  author_id_2,
  author_key_1,
  author_key_2,
  relation_kind
) values
${valuesSql}
on conflict (author_id_1, author_id_2) do nothing;
`);
};

export async function GET(request: NextRequest) {
    try {
        const rows = await queryRows(`
select
${authorSelect}
${authorFromClause}
where a.record_status = 'published'
order by a.author_reading, a.author_name, a.author_id;
`);
        const records = rows.map(rowToAuthorRecord);
        const { items: applicationRequests } = await loadVisibleApplicationRequests(request, "author");
        const recordMap = new Map(records.map((record)=>[
                record.id,
                record
            ]));
        for (const applicationRequest of applicationRequests) {
            if (!applicationRequest.entityId) continue;
            const existingRecord = recordMap.get(applicationRequest.entityId);
            if (existingRecord) {
                recordMap.set(applicationRequest.entityId, mergeAuthorRecordWithApplication(existingRecord, applicationRequest));
                continue;
            }
            recordMap.set(applicationRequest.entityId, buildApplicationAuthorRecord(applicationRequest));
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
        return createRouteErrorResponse(error, "failed to load authors", {
            databaseMessage: "データベースに接続できないため著者マスターを読み込めません。"
        });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PatchBody;
        const authorKey = normalizeAuthorKey(body.authorKey);
        const authorId = normalizeAuthorId(body.authorId);
        const field = String(body.field ?? "").trim();
        if (!authorKey && !authorId) {
            return NextResponse.json({
                error: "invalid author identifier"
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
${authorSelect}
${authorFromClause}
where ${currentUser.role === "super_admin" ? "a.record_status = 'published'" : "a.record_status <> 'deleted'"}
  and ${authorKey ? `a.id = ${sqlString(authorKey)}` : `a.author_id = ${sqlString(authorId)}`}
limit 1;
`);
        const beforeRow = beforeRows[0];
        if (!beforeRow) {
            return NextResponse.json({
                error: "author not found"
            }, {
                status: 404
            });
        }
        if (currentUser.role !== "super_admin") {
            await ensureEditableRequestStatus(currentUser.id, beforeRow.author_id ?? authorId);
        }

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        let assignments: Record<string, unknown> = {};
        const isPublishedSource = beforeRow.record_status === "published";
        if (field === "otherAuthorIds" && (currentUser.role === "super_admin" || !isPublishedSource)) {
            const currentAuthorId = beforeRow.author_id ?? "";
            if (!currentAuthorId) throw new Error("author_id could not be resolved");
            await saveAuthorAliases(currentAuthorId, normalizeAliasRows(body.value ?? null));
        } else if (field !== "otherAuthorIds") {
            assignments = getPatchAssignments(field, body.value ?? null, beforeRow);
            if (currentUser.role !== "super_admin" && !isPublishedSource) {
                assignments.record_status = "draft";
                assignments.approved_at = null;
            }
        if (currentUser.role === "super_admin" || !isPublishedSource) {
        const setSql = Object.entries(assignments).map(([column, value])=>`${column} = ${toPatchSqlValue(column, value)}`).join(",\n  ");
        await queryRows(`
update public.authors
set
  ${setSql},
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(currentUser.id)}),
  updated_by = ${sqlAuthUserRef(currentUser.id)}
where id = ${sqlString(beforeRow.id ?? "")}
  and ${currentUser.role === "super_admin" ? "record_status = 'published'" : "record_status <> 'deleted'"}
returning author_id;
`);
        }
        }

        const updatedRows = await queryRows(`
select
${authorSelect}
${authorFromClause}
where a.id = ${sqlString(beforeRow.id ?? "")}
limit 1;
`);
        const updatedRow = updatedRows[0];
        const responseRecord = currentUser.role !== "super_admin" && isPublishedSource
            ? applyAuthorPatchToRecord(rowToAuthorRecord(beforeRow), field, body.value ?? null)
            : updatedRow
                ? rowToAuthorRecord(updatedRow)
                : null;
        if (!responseRecord) throw new Error("updated author could not be loaded");

        const responseAuthorId = responseRecord.id || beforeRow.author_id || "";
        const responseAuthorName = responseRecord.name || beforeRow.author_name || "";
        if (currentUser.role !== "super_admin") {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "author",
                entityId: responseAuthorId,
                title: responseAuthorName,
                parentLabel: "著者マスター",
                requestedAction: isPublishedSource ? "update" : "create",
                routePath: `/masters/authors/${responseAuthorId}`,
                metadata: buildAuthorApplicationMetadataFromRecord(responseRecord),
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
  'authors',
  ${sqlString(responseAuthorId)},
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
        return createRouteErrorResponse(error, "failed to update author", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PostBody;
        const name = normalizeRequiredText(String(body.name ?? ""), "著者名");
        const reading = normalizeHiraganaReading(String(body.reading ?? ""), "読み");
        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const duplicates = await findPublishedAuthorsByName(name);
        if (duplicates.length > 0) {
            return NextResponse.json({
                error: "同じ著者名のマスターが存在します",
                duplicates
            }, {
                status: 409
            });
        }

        const authorId = await getNextAuthorId();
        const authorKey = createInternalId("au");
        await queryRows(`
insert into public.authors (
  id,
  author_id,
  author_name,
  author_reading,
  social_links,
  memo,
  tags,
  search_text,
  record_status,
  owner_user_id,
  created_by,
  updated_by,
  approved_by,
  approved_at
) values (
  ${sqlString(authorKey)},
  ${sqlString(authorId)},
  ${sqlString(name)},
  ${sqlString(reading)},
  '[]'::jsonb,
  '',
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
${authorSelect}
${authorFromClause}
where a.author_id = ${sqlString(authorId)}
limit 1;
`);
        const createdRow = createdRows[0];
        if (!createdRow) throw new Error("created author could not be loaded");

        if (currentUser.role !== "super_admin") {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "author",
                entityId: authorId,
                title: name,
                parentLabel: "著者マスター",
                requestedAction: "create",
                routePath: `/masters/authors/${authorId}`,
                metadata: buildAuthorApplicationMetadata(createdRow),
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
  'authors',
  ${sqlString(authorId)},
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
            record: rowToAuthorRecord(createdRow)
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
        return createRouteErrorResponse(error, "failed to create author", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as DeleteBody;
        const authorKey = normalizeAuthorKey(body.authorKey);
        const authorId = normalizeAuthorId(body.authorId);
        if (!authorKey && !authorId) {
            return NextResponse.json({
                error: "invalid author identifier"
            }, {
                status: 400
            });
        }

const beforeRows = await queryRows(`
select
${authorSelect}
${authorFromClause}
where ${currentUser.role === "super_admin" ? "a.record_status = 'published'" : "a.record_status <> 'deleted'"}
  and ${authorKey ? `a.id = ${sqlString(authorKey)}` : `a.author_id = ${sqlString(authorId)}`}
limit 1;
`);
        const beforeRow = beforeRows[0];
        if (!beforeRow) {
            return NextResponse.json({
                error: "author not found"
            }, {
                status: 404
            });
        }
        if (currentUser.role !== "super_admin") {
            await ensureEditableRequestStatus(currentUser.id, beforeRow.author_id ?? authorId);
        }

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const dependencies = await loadAuthorDeleteDependencies(beforeRow.id ?? "", beforeRow.author_id ?? "");
        if (dependencies.length > 0) {
            return NextResponse.json({
                error: "author has dependencies",
                dependencies
            }, {
                status: 409
            });
        }

        if (currentUser.role === "super_admin") {
            await queryRows(`
delete from public.author_alias_links
where author_key_1 = ${sqlString(beforeRow.id ?? "")}
   or author_key_2 = ${sqlString(beforeRow.id ?? "")};
`);

            await queryRows(`
update public.authors
set
  record_status = 'deleted',
  updated_by = ${sqlAuthUserRef(currentUser.id)},
  approved_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_at = now(),
  delete_reason = 'realtime_delete'
where id = ${sqlString(beforeRow.id ?? "")}
  and record_status = 'published'
returning author_id;
`);
        } else {
            await upsertDraftApplicationRequest({
                currentUser,
                entityType: "author",
                entityId: beforeRow.author_id ?? "",
                title: beforeRow.author_name ?? "",
                parentLabel: "著者マスター",
                requestedAction: "delete",
                routePath: `/masters/authors/${beforeRow.author_id ?? ""}`,
                metadata: buildAuthorApplicationMetadata(beforeRow),
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
  'authors',
  ${sqlString(beforeRow.author_id ?? "")},
  ${sqlString(beforeRow.author_name ?? "")},
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
            deletedAuthorId: beforeRow.author_id ?? ""
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: error.message
            }, {
                status: 400
            });
        }
        return createRouteErrorResponse(error, "failed to delete author", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}
