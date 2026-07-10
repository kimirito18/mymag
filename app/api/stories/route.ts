import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { isApplicationRequestLocked, loadActiveApplicationRequest, upsertDraftApplicationRequest } from "@/app/lib/application-request-drafts";
import { normalizeStoryReadingCore } from "@/app/lib/story-reading-similarity";
import type { StoryRow } from "@/app/lib/types";

export const runtime = "nodejs";

type PatchValue = string | string[] | number | null;
type PatchBody = {
    storyId?: unknown;
    field?: unknown;
    value?: PatchValue;
    position?: unknown;
    undoMeta?: unknown;
    debugDelayMs?: unknown;
};
type PostBody = {
    issueId?: unknown;
    row?: Partial<StoryRow>;
    undoMeta?: unknown;
    debugDelayMs?: unknown;
};
type DeleteBody = {
    storyId?: unknown;
    undoMeta?: unknown;
    debugDelayMs?: unknown;
};

class ValidationError extends Error {}

const storySelect = `
  story_id,
  story_type,
  series_title,
  series_title_reading,
  episode_number,
  coalesce(episode_number_sort::text, '') as episode_number_sort,
  title,
  title_reading,
  title_reading_core,
  subtitle,
  subtitle_reading,
  contributors::text as contributors,
  coalesce(page_count::text, '') as page_count,
  first_magazine_issue_id,
  color_info,
  memo,
  to_jsonb(tags)::text as tags_json,
  source_occurrences::text as source_occurrences,
  search_text,
  search_reading,
  status,
  record_status,
  coalesce(edit_version::text, '') as edit_version`;

const storyTypeLabels: Record<string, string> = {
    serial: "連載",
    one_shot: "読み切り",
    extra: "特別編",
    side_story: "外伝",
    unknown: "不明"
};

const storyTypeValues: Record<string, string> = {
    "連載": "serial",
    "読み切り": "one_shot",
    "特別編": "extra",
    "外伝": "side_story",
    "不明": "unknown",
    serial: "serial",
    one_shot: "one_shot",
    extra: "extra",
    side_story: "side_story",
    unknown: "unknown"
};

const parseJson = <T,>(value: string | null | undefined, fallback: T): T=>{
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

const normalizeUndoMetadata = (value: unknown)=>{
    if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, unknown>;
    return value as Record<string, unknown>;
};

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const sqlAuthUserRef = (value: string | null | undefined)=>{
    const normalized = String(value ?? "").trim();
    if (!normalized) return "null";
    return `${sqlString(normalized)}::uuid`;
};
const sqlJson = (value: unknown)=>`${sqlString(JSON.stringify(value))}::jsonb`;
const sqlNullableText = (value: string | null)=>value == null ? "null" : sqlString(value);
const sqlNullableNumber = (value: number | null)=>value == null ? "null" : String(value);
const sqlTextArray = (values: string[])=>`array[${values.map(sqlString).join(", ")}]::text[]`;
const sleep = (milliseconds: number)=>new Promise((resolve)=>setTimeout(resolve, milliseconds));

const normalizeDebugDelayMs = (value: unknown)=>{
    if (process.env.NODE_ENV === "production") return 0;
    const delay = Number(value);
    if (!Number.isFinite(delay) || delay <= 0) return 0;
    return Math.min(Math.round(delay), 5000);
};

const normalizeStoryId = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^S[0-9]{7}$/.test(normalized) ? normalized : "";
};

const normalizeIssueId = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^MI[0-9]{7}$/.test(normalized) ? normalized : "";
};

const ensureEditableIssueRequestStatus = async (userId: string, issueId: string) => {
    const activeRequest = await loadActiveApplicationRequest(userId, "magazine_issue_set", issueId);
    if (isApplicationRequestLocked(activeRequest?.status)) {
        throw new Error("この雑誌個別は申請中のため、編集中に戻すまで修正できません");
    }
    return activeRequest;
};

const parseRequestMetadata = (value: string | null | undefined)=>{
    if (!value) return {} as Record<string, unknown>;
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
};

const loadIssueRequestContext = async (issueId: string)=>{
    const rows = await queryRows(`
select
  mi.magazine_issue_id,
  mi.magazine_id,
  coalesce(mt.title, '') as magazine_title,
  coalesce(mi.issue_title, mt.title, '') as issue_title,
  coalesce(mi.issue_title_reading, mt.title_reading, '') as issue_title_reading,
  coalesce(mi.issue_label, '') as issue_label,
  coalesce(mi.publication_frequency, '') as publication_frequency,
  coalesce(mi.media_format, '') as media_format,
  coalesce(mi.subtitle, '') as subtitle,
  coalesce(mi.subtitle_reading, '') as subtitle_reading,
  coalesce(mi.volume_number, '') as volume_number,
  coalesce(mi.issue_number, '') as issue_number,
  coalesce(mi.total_issue_number, '') as total_issue_number,
  coalesce(mi.issue_number_displayed, '') as issue_number_displayed,
  coalesce(mi.sub_issue_number, '') as sub_issue_number,
  coalesce(mi.volume_issue_note, '') as volume_issue_note,
  coalesce(mi.publishers::text, '[]') as publishers_json,
  coalesce(mi.publisher_name, '') as publisher_name,
  coalesce(mi.price, '') as price,
  coalesce(mi.size, '') as size,
  coalesce(mi.note, '') as note,
  coalesce(mi.contents::text, '[]') as contents_json,
  to_jsonb(mi.tags)::text as tags_json,
  coalesce(mi.related_magazines::text, '[]') as related_magazines_json,
  coalesce(mi.binding, '') as binding,
  coalesce(mi.magazine_code, '') as magazine_code,
  to_jsonb(mi.category)::text as category_json,
  coalesce(mi.rating, '') as rating,
  coalesce(mi.record_status, '') as record_status,
  coalesce(mi.updated_at::text, '') as updated_at,
  coalesce(mi.source_work_count::text, '0') as source_work_count,
  coalesce(mi.source_first_work_id, '') as source_first_work_id
from public.magazine_issues mi
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
where mi.magazine_issue_id = ${sqlString(issueId)}
limit 1;
`);
    return rows[0] ?? null;
};

const markIssueDraftForEditor = async (issueId: string)=>{
    await queryRows(`
update public.magazine_issues
set
  record_status = 'draft',
  approved_at = null
where magazine_issue_id = ${sqlString(issueId)}
  and record_status <> 'deleted';
`);
};

const upsertIssueRequestForStoryEditor = async ({
    currentUser,
    issueId,
    stories,
    activeRequest
}: {
    currentUser: Awaited<ReturnType<typeof getCurrentUserContext>>;
    issueId: string;
    stories?: StoryRow[];
    activeRequest?: {
        request_id?: string;
        action?: string;
        status?: string;
        metadata_json?: string | null;
    } | null;
})=>{
    const issueRow = await loadIssueRequestContext(issueId);
    if (!issueRow?.magazine_issue_id || !issueRow.magazine_id) {
        throw new Error("story parent issue could not be resolved");
    }
    const requestMetadata = parseRequestMetadata(activeRequest?.metadata_json ?? null);
    const nextStories = stories ?? normalizeRequestStoryRows(requestMetadata.stories);
    await upsertDraftApplicationRequest({
        currentUser,
        entityType: "magazine_issue_set",
        entityId: issueRow.magazine_issue_id,
        title: issueRow.issue_label || issueRow.issue_title || issueRow.magazine_title || issueRow.magazine_issue_id,
        parentLabel: issueRow.magazine_title || issueRow.issue_title || "",
        requestedAction: issueRow.record_status === "published" ? "update" : "create",
        routePath: `/magazines/${issueRow.magazine_id}/issues/${issueRow.magazine_issue_id}?from=issue-list`,
        metadata: buildIssueApplicationMetadataFromContext({
            row: issueRow,
            stories: nextStories,
            metadata: requestMetadata
        })
    });
};

const normalizeRequiredText = (value: unknown, label: string)=>{
    const text = String(value ?? "").trim();
    if (!text) throw new ValidationError(`${label}は必須です`);
    return text;
};

const normalizeText = (value: unknown)=>String(value ?? "").trim();

const normalizeReading = (value: unknown, label: string)=>{
    const text = String(value ?? "").trim() || "みていぎ";
    if (!/^[ぁ-ゖー]+$/.test(text)) {
        throw new ValidationError(`${label}はひらがなと長音「ー」のみで入力してください`);
    }
    return text;
};

const normalizeOptionalReading = (value: unknown, label: string)=>{
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (!/^[ぁ-ゖー]+$/.test(text)) {
        throw new ValidationError(`${label}はひらがなと長音「ー」のみで入力してください`);
    }
    return text;
};

const normalizeStringArray = (value: unknown)=>{
    if (Array.isArray(value)) return value.map((part)=>String(part).trim()).filter(Boolean);
    return String(value ?? "").split(/[,\u3001]/).map((part)=>part.trim()).filter(Boolean);
};

const normalizeJsonArray = (value: unknown, label: string)=>{
    if (Array.isArray(value)) return value;
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

const normalizeContributors = (value: unknown)=>{
    return normalizeJsonArray(value, "著者").map((row)=>{
        if (!row || typeof row !== "object") return null;
        const record = row as Record<string, unknown>;
        return {
            role: String(record.role ?? "著").trim() || "著",
            name: String(record.name ?? "").trim(),
            author_id: String(record.author_id ?? record.id ?? "").trim()
        };
    }).filter((row): row is { role: string; name: string; author_id: string }=>Boolean(row?.name || row?.author_id));
};

const normalizePositiveInteger = (value: unknown, label: string)=>{
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) throw new ValidationError(`${label}は整数で入力してください`);
    const numberValue = Number(text);
    if (numberValue <= 0) throw new ValidationError(`${label}は1以上で入力してください`);
    return numberValue;
};

const normalizeDecimal = (value: unknown, label: string)=>{
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new ValidationError(`${label}は数字で入力してください`);
    return Number(text);
};

const normalizeStoryType = (value: unknown)=>{
    const text = String(value ?? "").trim();
    const storyType = storyTypeValues[text] ?? "unknown";
    if (!storyTypeValues[storyType]) throw new ValidationError("タイプの値が不正です");
    return storyType;
};

const toPatchSqlValue = (column: string, value: unknown)=>{
    if (value == null) return "null";
    if (typeof value === "number") return sqlNullableNumber(value);
    if (Array.isArray(value)) return column === "tags" ? sqlTextArray(value.map(String)) : sqlJson(value);
    if (typeof value === "object") return sqlJson(value);
    return sqlNullableText(String(value));
};

const buildSearchText = (row: Record<string, unknown>)=>[
    row.story_id,
    row.title,
    row.title_reading,
    row.series_title,
    row.series_title_reading,
    row.episode_number,
    row.subtitle,
    row.subtitle_reading,
    ...(Array.isArray(row.contributors) ? row.contributors.flatMap((contributor)=>{
        const record = contributor as Record<string, unknown>;
        return [record.role, record.name, record.author_id];
    }) : [])
].map((part)=>String(part ?? "").trim()).filter(Boolean).join(" ").slice(0, 1000);

const buildSearchReading = (row: Record<string, unknown>)=>[
    row.title_reading,
    row.series_title_reading,
    row.subtitle_reading
].map((part)=>String(part ?? "").trim()).filter(Boolean).join(" ").slice(0, 1000);

const rowToStory = (row: Record<string, string | null>): StoryRow=>{
    const sourceOccurrences = parseJson<Array<Record<string, unknown>>>(row.source_occurrences, []);
    const sourcePosition = Number(sourceOccurrences[0]?.position);
    const contributors = parseJson<Array<Record<string, unknown>>>(row.contributors, []);
    return {
        storyId: row.story_id ?? "",
        position: Number.isFinite(sourcePosition) && sourcePosition > 0 ? sourcePosition : 1,
        title: row.title ?? "",
        titleReading: row.title_reading ?? "みていぎ",
        authors: JSON.stringify(contributors.map((contributor)=>({
            role: String(contributor.role ?? "著"),
            name: String(contributor.name ?? ""),
            author_id: String(contributor.author_id ?? "")
        })).filter((contributor)=>contributor.name || contributor.author_id)),
        storyType: storyTypeLabels[row.story_type ?? ""] ?? row.story_type ?? "不明",
        pageCount: row.page_count ?? "",
        seriesTitle: row.series_title ?? "",
        seriesReading: row.series_title ? row.series_title_reading ?? "" : "",
        subtitle: row.subtitle ?? "",
        subtitleReading: row.subtitle ? row.subtitle_reading ?? "" : "",
        episodeNumber: row.episode_number_sort ?? "",
        episodeLabel: row.episode_number ?? "",
        colorInfo: row.color_info ?? "",
        memo: row.memo ?? "",
        tags: parseJson<string[]>(row.tags_json, [])
    };
};

const normalizeRequestStoryRows = (value: unknown): StoryRow[]=>{
    if (!Array.isArray(value)) return [];
    return value.map((item, index)=>{
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const positionValue = Number(row.position ?? index + 1);
        return {
            storyId: String(row.storyId ?? "").trim(),
            position: Number.isFinite(positionValue) && positionValue > 0 ? positionValue : index + 1,
            title: String(row.title ?? "").trim(),
            titleReading: String(row.titleReading ?? "").trim() || "みていぎ",
            authors: typeof row.authors === "string" ? row.authors : JSON.stringify(row.authors ?? []),
            storyType: String(row.storyType ?? "不明").trim() || "不明",
            pageCount: String(row.pageCount ?? "").trim(),
            seriesTitle: String(row.seriesTitle ?? "").trim(),
            seriesReading: String(row.seriesReading ?? "").trim(),
            subtitle: String(row.subtitle ?? "").trim(),
            subtitleReading: String(row.subtitleReading ?? "").trim(),
            episodeNumber: String(row.episodeNumber ?? "").trim(),
            episodeLabel: String(row.episodeLabel ?? "").trim(),
            colorInfo: String(row.colorInfo ?? "").trim(),
            memo: String(row.memo ?? "").trim(),
            tags: Array.isArray(row.tags) ? row.tags.map((tag)=>String(tag).trim()).filter(Boolean) : []
        };
    }).filter((row)=>row.title || row.storyId);
};

const getPatchAssignments = (field: string, value: PatchValue)=>{
    switch(field){
        case "title":
            return {
                title: normalizeRequiredText(value, "作品タイトル")
            };
        case "titleReading":
            return {
                title_reading: normalizeReading(value, "作品タイトルの読み")
            };
        case "position":
            return {
                position: normalizePositiveInteger(value, "掲載順")
            };
        case "authors":
            return {
                contributors: normalizeContributors(value)
            };
        case "storyType":
            return {
                story_type: normalizeStoryType(value)
            };
        case "pageCount":
            return {
                page_count: normalizePositiveInteger(value, "ページ")
            };
        case "seriesTitle": {
            const seriesTitle = normalizeText(value);
            return {
                series_title: seriesTitle,
                ...(seriesTitle ? {} : {
                    series_title_reading: ""
                })
            };
        }
        case "seriesReading":
            return {
                series_title_reading: normalizeOptionalReading(value, "シリーズ読み")
            };
        case "subtitle": {
            const subtitle = normalizeText(value);
            return {
                subtitle,
                ...(subtitle ? {} : {
                    subtitle_reading: ""
                })
            };
        }
        case "subtitleReading":
            return {
                subtitle_reading: normalizeOptionalReading(value, "サブタイトル読み")
            };
        case "episodeNumber":
            return {
                episode_number_sort: normalizeDecimal(value, "話数")
            };
        case "episodeLabel":
            return {
                episode_number: normalizeText(value)
            };
        case "colorInfo":
            return {
                color_info: normalizeText(value)
            };
        case "memo":
            return {
                memo: String(value ?? "").trim()
            };
        case "tags":
            return {
                tags: normalizeStringArray(value)
            };
        default:
            throw new ValidationError("保存対象外の項目です");
    }
};

const applyPatchToStoryRecord = (story: StoryRow, field: string, value: PatchValue): StoryRow=>{
    const assignments: Record<string, unknown> = getPatchAssignments(field, value);
    if (field === "position") {
        return {
            ...story,
            position: Number(assignments.position ?? story.position) || story.position
        };
    }
    return {
        ...story,
        title: String(assignments.title ?? story.title),
        titleReading: String(assignments.title_reading ?? story.titleReading),
        authors: JSON.stringify(assignments.contributors ?? parseJson(story.authors, [])),
        storyType: storyTypeLabels[String(assignments.story_type ?? "")] ?? String((assignments.story_type ?? story.storyType) || "不明"),
        pageCount: assignments.page_count == null ? "" : String(assignments.page_count),
        seriesTitle: String(assignments.series_title ?? story.seriesTitle),
        seriesReading: String(assignments.series_title_reading ?? story.seriesReading),
        subtitle: String(assignments.subtitle ?? story.subtitle),
        subtitleReading: String(assignments.subtitle_reading ?? story.subtitleReading),
        episodeNumber: assignments.episode_number_sort == null ? "" : String(assignments.episode_number_sort),
        episodeLabel: String(assignments.episode_number ?? story.episodeLabel),
        colorInfo: String(assignments.color_info ?? story.colorInfo),
        memo: String(assignments.memo ?? story.memo),
        tags: Array.isArray(assignments.tags) ? assignments.tags.map((tag)=>String(tag)) : story.tags
    };
};

const mergeRowForSearch = (row: Record<string, string | null>, assignments: Record<string, unknown>)=>({
    story_id: row.story_id ?? "",
    title: assignments.title ?? row.title ?? "",
    title_reading: assignments.title_reading ?? row.title_reading ?? "",
    series_title: assignments.series_title ?? row.series_title ?? "",
    series_title_reading: assignments.series_title_reading ?? row.series_title_reading ?? "",
    episode_number: assignments.episode_number ?? row.episode_number ?? "",
    subtitle: assignments.subtitle ?? row.subtitle ?? "",
    subtitle_reading: assignments.subtitle_reading ?? row.subtitle_reading ?? "",
    contributors: assignments.contributors ?? parseJson(row.contributors, [])
});

const updateSourceOccurrencePosition = (sourceOccurrencesText: string | null | undefined, position: number, issueId = "")=>{
    const rows = parseJson<Array<Record<string, unknown>>>(sourceOccurrencesText, []);
    const first = rows[0] ?? {};
    return [
        {
            ...first,
            ...issueId ? {
                magazine_issue_id: issueId
            } : {},
            position: String(position)
        },
        ...rows.slice(1)
    ];
};

const loadIssueStories = async (issueId: string, mode: "published" | "editable" = "published")=>{
    const rows = await queryRows(`
select
${storySelect}
from public.stories
where first_magazine_issue_id = ${sqlString(issueId)}
  and ${mode === "published" ? "record_status = 'published'" : "record_status <> 'deleted'"}
  and coalesce(status, '') <> 'deleted'
order by
  case
    when source_occurrences->0->>'position' ~ '^[0-9]+$'
    then (source_occurrences->0->>'position')::integer
    else null
  end nulls last,
  story_id;
`);
    return rows.map((row)=>rowToStory(row));
};

const buildIssueApplicationMetadataFromContext = ({
    row,
    stories,
    metadata
}: {
    row: Record<string, string | null>;
    stories: StoryRow[];
    metadata?: Record<string, unknown>;
})=>({
    magazineId: row.magazine_id ?? "",
    magazineTitle: row.magazine_title ?? "",
    issueTitle: row.issue_title ?? row.magazine_title ?? "",
    issueLabel: row.issue_label ?? "",
    titleReading: row.issue_title_reading ?? "",
    publicationFrequency: row.publication_frequency ?? "",
    mediaFormat: row.media_format ?? "",
    subtitle: row.subtitle ?? "",
    subtitleReading: row.subtitle_reading ?? "",
    volumeNumber: row.volume_number ?? "",
    issueNumber: row.issue_number ?? "",
    totalIssueNumber: row.total_issue_number ?? "",
    issueNumberDisplayed: row.issue_number_displayed ?? "",
    subIssueNumber: row.sub_issue_number ?? "",
    volumeIssueNote: row.volume_issue_note ?? "",
    publishers: parseJson<unknown[]>(row.publishers_json, []),
    publisherName: row.publisher_name ?? "",
    price: row.price ?? "",
    size: row.size ?? "",
    memo: row.note ?? "",
    stories,
    contents: Object.prototype.hasOwnProperty.call(metadata ?? {}, "contents")
        ? Array.isArray(metadata?.contents)
            ? metadata?.contents as unknown[]
            : []
        : parseJson<unknown[]>(row.contents_json, []),
    tags: parseJson<string[]>(row.tags_json, []),
    relatedMagazines: parseJson<unknown[]>(row.related_magazines_json, []),
    binding: row.binding ?? "",
    magazineCode: row.magazine_code ?? "",
    category: parseJson<string[]>(row.category_json, []),
    rating: row.rating ?? "",
    digest: row.issue_label ?? "",
    recordStatus: row.record_status ?? "",
    sourceWorkCount: stories.length,
    sourceFirstWorkId: stories[0]?.storyId ?? ""
});

const loadStoryRow = async (storyId: string)=>{
    const rows = await queryRows(`
select
${storySelect}
from public.stories
where story_id = ${sqlString(storyId)}
limit 1;
`);
    return rows[0];
};

const loadStoryRawSnapshot = async (storyId: string)=>{
    const rows = await queryRows(`
select
  to_jsonb(s)::text as row_json
from public.stories s
where s.story_id = ${sqlString(storyId)}
limit 1;
`);
    return rows[0]?.row_json ?? "{}";
};

const insertUndoLog = async ({
    currentUser,
    issueId,
    metadata,
    beforeData,
    afterData
}: {
    currentUser: Awaited<ReturnType<typeof getCurrentUserContext>>;
    issueId: string;
    metadata: Record<string, unknown>;
    beforeData: unknown;
    afterData: unknown;
})=>{
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
  ${sqlString(currentUser.id)}::uuid,
  ${sqlString(currentUser.id)}::uuid,
  'undo_action',
  'magazine_issue',
  ${sqlString(issueId)},
  ${sqlJson(metadata)},
  ${sqlJson(beforeData)},
  ${sqlJson(afterData)},
  'realtime_save'
);
`);

    await queryRows(`
delete from public.user_logs
where id in (
  select stale.id
  from (
    select id
    from public.user_logs
    where user_id = ${sqlString(currentUser.id)}::uuid
      and log_type = 'undo_action'
      and target_type = 'magazine_issue'
      and target_id = ${sqlString(issueId)}
      and undone_at is null
    order by created_at desc, id desc
    offset ${Math.max(0, currentUser.undoStackLimit)}
  ) as stale
);
`);
};

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json() as PatchBody;
        const storyId = normalizeStoryId(body.storyId);
        const field = String(body.field ?? "").trim();
        const undoMeta = normalizeUndoMetadata(body.undoMeta);
        if (!storyId) {
            return NextResponse.json({
                error: "invalid storyId"
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

        const currentUser = await getCurrentUserContext(request);
        const beforeRow = await loadStoryRow(storyId);
        if (!beforeRow || beforeRow.record_status === "deleted") {
            return NextResponse.json({
                error: "story not found"
            }, {
                status: 404
            });
        }
        const beforeRawSnapshot = await loadStoryRawSnapshot(storyId);
        const parentIssueId = beforeRow.first_magazine_issue_id ?? "";
        const parentIssueRow = parentIssueId ? await loadIssueRequestContext(parentIssueId) : null;
        const isPublishedParentIssue = parentIssueRow?.record_status === "published";
        const activeIssueRequest = currentUser.role !== "super_admin" && parentIssueId
            ? await ensureEditableIssueRequestStatus(currentUser.id, parentIssueId)
            : null;

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        if (currentUser.role !== "super_admin" && isPublishedParentIssue) {
            const requestMetadata = parseRequestMetadata(activeIssueRequest?.metadata_json ?? null);
            const draftStories = Object.prototype.hasOwnProperty.call(requestMetadata, "stories")
                ? normalizeRequestStoryRows(requestMetadata.stories)
                : await loadIssueStories(parentIssueId, "published");
            const beforeRequestMetadata = buildIssueApplicationMetadataFromContext({
                row: parentIssueRow ?? await loadIssueRequestContext(parentIssueId),
                stories: draftStories,
                metadata: requestMetadata
            });
            const updatedStories = draftStories.map((story)=>story.storyId === storyId ? applyPatchToStoryRecord(story, field, body.value ?? null) : story);
            const responseStory = updatedStories.find((story)=>story.storyId === storyId);
            if (!responseStory) {
                throw new Error("updated story could not be resolved");
            }
            const afterRequestMetadata = buildIssueApplicationMetadataFromContext({
                row: parentIssueRow ?? await loadIssueRequestContext(parentIssueId),
                stories: updatedStories,
                metadata: requestMetadata
            });
            await upsertIssueRequestForStoryEditor({
                currentUser,
                issueId: parentIssueId,
                stories: updatedStories,
                activeRequest: activeIssueRequest
            });

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
  'stories',
  ${sqlString(storyId)},
  ${sqlString(responseStory.title || (beforeRow.title ?? ""))},
  ${sqlJson({
                field,
                row: beforeRow
            })},
  ${sqlJson({
                field,
                row: responseStory
            })},
  ${sqlString(currentUser.role)},
  'editor_issue_request_update'
);
`);

            await insertUndoLog({
                currentUser,
                issueId: parentIssueId,
                metadata: {
                    kind: "story",
                    field,
                    issueId: parentIssueId,
                    storyId,
                    label: "作品リスト",
                    action: "update",
                    storageMode: "application_request",
                    ...undoMeta
                },
                beforeData: beforeRequestMetadata,
                afterData: afterRequestMetadata
            });

            return NextResponse.json({
                story: responseStory
            });
        }

        const assignments: Record<string, unknown> = getPatchAssignments(field, body.value ?? null);
        if (field === "position") {
            assignments.source_occurrences = updateSourceOccurrencePosition(beforeRow.source_occurrences, Number(assignments.position ?? 1), parentIssueId);
            delete assignments.position;
        }
        assignments.status = "active";
        if (currentUser.role !== "super_admin") {
            assignments.record_status = "draft";
            assignments.approved_at = null;
        }
        const searchRow = mergeRowForSearch(beforeRow, assignments);
        assignments.title_reading_core = normalizeStoryReadingCore(String(searchRow.title_reading ?? ""));
        assignments.search_text = buildSearchText(searchRow);
        assignments.search_reading = buildSearchReading(searchRow);

        const setSql = Object.entries(assignments).map(([column, value])=>`${column} = ${toPatchSqlValue(column, value)}`).join(",\n  ");
        await queryRows(`
update public.stories
set
  ${setSql},
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(currentUser.id)}),
  updated_by = ${sqlAuthUserRef(currentUser.id)}
where story_id = ${sqlString(storyId)}
  and ${currentUser.role === "super_admin" ? "record_status = 'published'" : "record_status <> 'deleted'"}
returning story_id;
`);

        const updatedRow = await loadStoryRow(storyId);
        const afterRawSnapshot = await loadStoryRawSnapshot(storyId);
        if (!updatedRow) throw new Error("updated story could not be loaded");

        if (currentUser.role !== "super_admin") {
            await markIssueDraftForEditor(parentIssueId);
            await upsertIssueRequestForStoryEditor({
                currentUser,
                issueId: parentIssueId,
                stories: await loadIssueStories(parentIssueId, "editable"),
                activeRequest: activeIssueRequest
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
  'stories',
  ${sqlString(storyId)},
  ${sqlString(updatedRow.title ?? "")},
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

        await insertUndoLog({
            currentUser,
            issueId: parentIssueId,
            metadata: {
                kind: "story",
                field,
                issueId: parentIssueId,
                storyId,
                label: "作品リスト",
                action: "update",
                storageMode: "story_row",
                ...undoMeta
            },
            beforeData: beforeRawSnapshot ? JSON.parse(beforeRawSnapshot) : {},
            afterData: afterRawSnapshot ? JSON.parse(afterRawSnapshot) : {}
        });

        return NextResponse.json({
            story: rowToStory(updatedRow)
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: error.message
            }, {
                status: 400
            });
        }
        return createRouteErrorResponse(error, "failed to update story", {
            databaseMessage: "データベースに接続できないため作品データを更新できません。"
        });
    }
}

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PostBody;
        const issueId = normalizeIssueId(body.issueId);
        const undoMeta = normalizeUndoMetadata(body.undoMeta);
        if (!issueId) {
            return NextResponse.json({
                error: "invalid issueId"
            }, {
                status: 400
            });
        }
        const row = body.row ?? {};
        const title = normalizeRequiredText(row.title, "作品タイトル");
        const titleReading = normalizeReading(row.titleReading, "作品タイトルの読み");
        const contributors = normalizeContributors(row.authors ?? "");
        const position = normalizePositiveInteger(row.position ?? 1, "掲載順") ?? 1;
        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const issueRows = await queryRows(`
select
  magazine_issue_id,
  id,
  record_status,
  coalesce(published_date::text, '') as published_date
from public.magazine_issues
where magazine_issue_id = ${sqlString(issueId)}
  and ${currentUser.role === "super_admin" ? "record_status = 'published'" : "record_status <> 'deleted'"}
limit 1;
`);
        if (!issueRows[0]) {
            return NextResponse.json({
                error: "magazine issue not found"
            }, {
                status: 404
            });
        }
        if (!issueRows[0].id) {
            throw new Error("magazine issue internal key could not be loaded");
        }
        const activeIssueRequest = currentUser.role !== "super_admin"
            ? await ensureEditableIssueRequestStatus(currentUser.id, issueId)
            : null;
        const isPublishedParentIssue = issueRows[0].record_status === "published";

        const nextIdRows = await queryRows(`
select 'S' || lpad((coalesce(max(substring(story_id from 2)::integer), 0) + 1)::text, 7, '0') as story_id
from public.stories
where story_id ~ '^S[0-9]{7}$';
`);
        const storyId = nextIdRows[0]?.story_id ?? "";
        if (!storyId) throw new Error("new story id could not be generated");
        const storyKey = createInternalId("st");

        const baseRow = {
            story_id: storyId,
            title,
            title_reading: titleReading,
            series_title: normalizeText(row.seriesTitle),
            series_title_reading: normalizeText(row.seriesTitle) ? normalizeOptionalReading(row.seriesReading, "シリーズ読み") : "",
            episode_number: normalizeText(row.episodeLabel),
            subtitle: normalizeText(row.subtitle),
            subtitle_reading: normalizeText(row.subtitle) ? normalizeOptionalReading(row.subtitleReading, "サブタイトル読み") : "",
            contributors
        };
        const sourceOccurrences = updateSourceOccurrencePosition(null, position, issueId);

        if (currentUser.role !== "super_admin" && isPublishedParentIssue) {
            const requestMetadata = parseRequestMetadata(activeIssueRequest?.metadata_json ?? null);
            const existingStories = Object.prototype.hasOwnProperty.call(requestMetadata, "stories")
                ? normalizeRequestStoryRows(requestMetadata.stories)
                : await loadIssueStories(issueId, "published");
            const issueContextRow = await loadIssueRequestContext(issueId);
            if (!issueContextRow) {
                throw new Error("story parent issue could not be resolved");
            }
            const beforeRequestMetadata = buildIssueApplicationMetadataFromContext({
                row: issueContextRow,
                stories: existingStories,
                metadata: requestMetadata
            });
            const insertedStory: StoryRow = {
                storyId,
                position,
                title,
                titleReading,
                authors: JSON.stringify(contributors),
                storyType: storyTypeLabels[normalizeStoryType(row.storyType)] ?? "不明",
                pageCount: normalizePositiveInteger(row.pageCount, "ページ") == null ? "" : String(normalizePositiveInteger(row.pageCount, "ページ")),
                seriesTitle: String(baseRow.series_title),
                seriesReading: String(baseRow.series_title_reading),
                subtitle: String(baseRow.subtitle),
                subtitleReading: String(baseRow.subtitle_reading),
                episodeNumber: normalizeDecimal(row.episodeNumber, "話数") == null ? "" : String(normalizeDecimal(row.episodeNumber, "話数")),
                episodeLabel: String(baseRow.episode_number),
                colorInfo: normalizeText(row.colorInfo),
                memo: normalizeText(row.memo),
                tags: normalizeStringArray(row.tags ?? [])
            };
            const nextStories = [
                ...existingStories,
                insertedStory
            ].sort((left, right)=>left.position - right.position || (left.storyId ?? "").localeCompare(right.storyId ?? "", "ja"));
            const afterRequestMetadata = buildIssueApplicationMetadataFromContext({
                row: issueContextRow,
                stories: nextStories,
                metadata: requestMetadata
            });
            await upsertIssueRequestForStoryEditor({
                currentUser,
                issueId,
                stories: nextStories,
                activeRequest: activeIssueRequest
            });

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
  'stories',
  ${sqlString(storyId)},
  ${sqlString(insertedStory.title)},
  '{}'::jsonb,
  ${sqlJson({
                row: insertedStory
            })},
  ${sqlString(currentUser.role)},
  'editor_issue_request_create'
);
`);

            await insertUndoLog({
                currentUser,
                issueId,
                metadata: {
                    kind: "story",
                    field: "create",
                    issueId,
                    storyId,
                    label: "作品リスト",
                    action: "create",
                    storageMode: "application_request",
                    ...undoMeta
                },
                beforeData: beforeRequestMetadata,
                afterData: afterRequestMetadata
            });

            return NextResponse.json({
                story: insertedStory
            }, {
                status: 201
            });
        }

        await queryRows(`
insert into public.stories (
  id,
  story_id,
  story_type,
  series_title,
  series_title_reading,
  episode_number,
  episode_number_sort,
  title,
  title_reading,
  title_reading_core,
  subtitle,
  subtitle_reading,
  contributors,
  page_count,
  first_published_date,
  first_magazine_issue_id,
  first_magazine_issue_key,
  status,
  color_info,
  memo,
  tags,
  source_work_ids,
  source_occurrences,
  search_text,
  search_reading,
  record_status,
  owner_user_id,
  created_by,
  updated_by,
  approved_by
) values (
  ${sqlString(storyKey)},
  ${sqlString(storyId)},
  ${sqlString(normalizeStoryType(row.storyType))},
  ${sqlString(String(baseRow.series_title))},
  ${sqlString(String(baseRow.series_title_reading))},
  ${sqlString(String(baseRow.episode_number))},
  ${toPatchSqlValue("episode_number_sort", normalizeDecimal(row.episodeNumber, "話数"))},
  ${sqlString(title)},
  ${sqlString(titleReading)},
  ${sqlString(normalizeStoryReadingCore(titleReading))},
  ${sqlString(String(baseRow.subtitle))},
  ${sqlString(String(baseRow.subtitle_reading))},
  ${sqlJson(contributors)},
  ${toPatchSqlValue("page_count", normalizePositiveInteger(row.pageCount, "ページ"))},
  ${issueRows[0].published_date ? `${sqlString(issueRows[0].published_date)}::date` : "null"},
  ${sqlString(issueId)},
  ${sqlString(issueRows[0].id)},
  'active',
  ${sqlString(normalizeText(row.colorInfo))},
  ${sqlString(normalizeText(row.memo))},
  ${sqlTextArray(normalizeStringArray(row.tags ?? []))},
  '[]'::jsonb,
  ${sqlJson(sourceOccurrences)},
  ${sqlString(buildSearchText(baseRow))},
  ${sqlString(buildSearchReading(baseRow))},
  ${sqlString(currentUser.role === "super_admin" ? "published" : "draft")},
  ${sqlAuthUserRef(currentUser.id)},
  ${sqlAuthUserRef(currentUser.id)},
  ${sqlAuthUserRef(currentUser.id)},
  ${currentUser.role === "super_admin" ? sqlAuthUserRef(currentUser.id) : "null"}
);
`);

        const insertedRow = await loadStoryRow(storyId);
        if (!insertedRow) throw new Error("created story could not be loaded");

        if (currentUser.role !== "super_admin") {
            await markIssueDraftForEditor(issueId);
            await upsertIssueRequestForStoryEditor({
                currentUser,
                issueId,
                stories: await loadIssueStories(issueId, "editable"),
                activeRequest: activeIssueRequest
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
  'stories',
  ${sqlString(storyId)},
  ${sqlString(insertedRow.title ?? "")},
  '{}'::jsonb,
  ${sqlJson({
            row: insertedRow
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_save" : "editor_draft_create")}
);
`);

        const afterRawSnapshot = await loadStoryRawSnapshot(storyId);
        await insertUndoLog({
            currentUser,
            issueId,
            metadata: {
                kind: "story",
                field: "create",
                issueId,
                storyId,
                label: "作品リスト",
                action: "create",
                storageMode: "story_row",
                ...undoMeta
            },
            beforeData: {},
            afterData: afterRawSnapshot ? JSON.parse(afterRawSnapshot) : {}
        });

        return NextResponse.json({
            story: rowToStory(insertedRow)
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
        return createRouteErrorResponse(error, "failed to create story", {
            databaseMessage: "データベースに接続できないため作品データを作成できません。"
        });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as DeleteBody;
        const storyId = normalizeStoryId(body.storyId);
        const undoMeta = normalizeUndoMetadata(body.undoMeta);
        if (!storyId) {
            return NextResponse.json({
                error: "invalid storyId"
            }, {
                status: 400
            });
        }

        const beforeRow = await loadStoryRow(storyId);
        if (!beforeRow || beforeRow.record_status === "deleted" || beforeRow.status === "deleted") {
            return NextResponse.json({
                error: "story not found"
            }, {
                status: 404
            });
        }
        const beforeRawSnapshot = await loadStoryRawSnapshot(storyId);
        const parentIssueId = beforeRow.first_magazine_issue_id ?? "";
        const parentIssueRow = parentIssueId ? await loadIssueRequestContext(parentIssueId) : null;
        const isPublishedParentIssue = parentIssueRow?.record_status === "published";
        const activeIssueRequest = currentUser.role !== "super_admin" && parentIssueId
            ? await ensureEditableIssueRequestStatus(currentUser.id, parentIssueId)
            : null;

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        if (currentUser.role === "super_admin") {
            await queryRows(`
update public.stories
set
  status = 'deleted',
  record_status = 'deleted',
  updated_by = ${sqlAuthUserRef(currentUser.id)},
  approved_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_at = now(),
  delete_reason = 'realtime_delete'
where story_id = ${sqlString(storyId)}
  and record_status = 'published'
returning story_id;
`);
        } else if (isPublishedParentIssue) {
            const requestMetadata = parseRequestMetadata(activeIssueRequest?.metadata_json ?? null);
            const draftStories = Object.prototype.hasOwnProperty.call(requestMetadata, "stories")
                ? normalizeRequestStoryRows(requestMetadata.stories)
                : await loadIssueStories(parentIssueId, "published");
            const issueContextRow = parentIssueRow ?? await loadIssueRequestContext(parentIssueId);
            if (!issueContextRow) {
                throw new Error("story parent issue could not be resolved");
            }
            const beforeRequestMetadata = buildIssueApplicationMetadataFromContext({
                row: issueContextRow,
                stories: draftStories,
                metadata: requestMetadata
            });
            const nextStories = draftStories.filter((story)=>story.storyId !== storyId);
            const afterRequestMetadata = buildIssueApplicationMetadataFromContext({
                row: issueContextRow,
                stories: nextStories,
                metadata: requestMetadata
            });
            await upsertIssueRequestForStoryEditor({
                currentUser,
                issueId: parentIssueId,
                stories: nextStories,
                activeRequest: activeIssueRequest
            });

            await insertUndoLog({
                currentUser,
                issueId: parentIssueId,
                metadata: {
                    kind: "story",
                    field: "delete",
                    issueId: parentIssueId,
                    storyId,
                    label: "作品リスト",
                    action: "delete",
                    storageMode: "application_request",
                    ...undoMeta
                },
                beforeData: beforeRequestMetadata,
                afterData: afterRequestMetadata
            });
        } else {
            await queryRows(`
update public.stories
set
  status = 'deleted',
  record_status = 'draft',
  approved_at = null,
  deleted_at = null,
  delete_reason = 'editor_delete_request'
where story_id = ${sqlString(storyId)}
  and record_status <> 'deleted'
returning story_id;
`);
            await markIssueDraftForEditor(parentIssueId);
            await upsertIssueRequestForStoryEditor({
                currentUser,
                issueId: parentIssueId,
                stories: await loadIssueStories(parentIssueId, "editable"),
                activeRequest: activeIssueRequest
            });

            const afterRawSnapshot = await loadStoryRawSnapshot(storyId);
            await insertUndoLog({
                currentUser,
                issueId: parentIssueId,
                metadata: {
                    kind: "story",
                    field: "delete",
                    issueId: parentIssueId,
                    storyId,
                    label: "作品リスト",
                    action: "delete",
                    storageMode: "story_row",
                    ...undoMeta
                },
                beforeData: beforeRawSnapshot ? JSON.parse(beforeRawSnapshot) : {},
                afterData: afterRawSnapshot ? JSON.parse(afterRawSnapshot) : {}
            });
        }

        if (currentUser.role === "super_admin") {
            const afterRawSnapshot = await loadStoryRawSnapshot(storyId);
            await insertUndoLog({
                currentUser,
                issueId: parentIssueId,
                metadata: {
                    kind: "story",
                    field: "delete",
                    issueId: parentIssueId,
                    storyId,
                    label: "作品リスト",
                    action: "delete",
                    storageMode: "story_row",
                    ...undoMeta
                },
                beforeData: beforeRawSnapshot ? JSON.parse(beforeRawSnapshot) : {},
                afterData: afterRawSnapshot ? JSON.parse(afterRawSnapshot) : {}
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
  'stories',
  ${sqlString(storyId)},
  ${sqlString(beforeRow.title ?? "")},
  ${sqlJson({
            row: beforeRow
        })},
  ${sqlJson({
            status: "deleted",
            record_status: currentUser.role === "super_admin" ? "deleted" : isPublishedParentIssue ? "published" : "draft"
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_delete" : isPublishedParentIssue ? "editor_issue_request_delete" : "editor_delete_request")}
);
`);

        return NextResponse.json({
            deletedStoryId: storyId
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: error.message
            }, {
                status: 400
            });
        }
        return createRouteErrorResponse(error, "failed to delete story", {
            databaseMessage: "データベースに接続できないため作品データを削除できません。"
        });
    }
}
