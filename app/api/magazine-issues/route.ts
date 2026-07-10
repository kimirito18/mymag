import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { createInternalId } from "@/app/lib/server-id";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { isApplicationRequestLocked, loadActiveApplicationRequest, upsertDraftApplicationRequest } from "@/app/lib/application-request-drafts";
import { parseRoleNameText } from "@/app/lib/page-utils";
import { loadVisibleApplicationRequests } from "@/app/lib/server-visible-application-requests";
import type { ContentRow, ExistingIssue, StoryRow } from "@/app/lib/types";

export const runtime = "nodejs";

type IssueCount = {
    magazineId: string;
    count: number;
};
type PatchValue = string | number | boolean | null | ContentRow[];
type PatchBody = {
    issueId?: unknown;
    field?: unknown;
    value?: PatchValue;
    undoMeta?: unknown;
    debugDelayMs?: unknown;
};
type DeleteBody = {
    issueId?: unknown;
    debugDelayMs?: unknown;
};
type PostBody = {
    magazineId?: unknown;
    issueTitle?: unknown;
    titleReading?: unknown;
    debugDelayMs?: unknown;
};

const ensureEditableIssueRequestStatus = async (userId: string, issueId: string) => {
    const activeRequest = await loadActiveApplicationRequest(userId, "magazine_issue_set", issueId);
    if (isApplicationRequestLocked(activeRequest?.status)) {
        throw new Error("この雑誌個別は申請中のため、編集中に戻すまで修正できません");
    }
    return activeRequest;
};

const issueColumnSelect = `
  mi.magazine_issue_id,
  mi.magazine_id,
  mi.magazine_key,
  mt.title as magazine_title,
  mt.title_reading,
  mi.publisher_id,
  mi.publisher_key,
  coalesce(p.publisher_name, mi.publisher_name, '出版社不明') as resolved_publisher_name,
  coalesce(p.publisher_reading, 'しゅっぱんしゃふめい') as publisher_reading,
  mi.issue_title,
  mi.issue_title_reading,
  mi.issue_label,
  mi.subtitle,
  mi.subtitle_reading,
  mi.publication_frequency,
  mi.media_format,
  coalesce(mi.published_date::text, '') as published_date,
  coalesce(mi.year::text, '') as year,
  coalesce(mi.month::text, '') as month,
  coalesce(mi.day::text, '') as day,
  coalesce(mi.release_year::text, '') as release_year,
  coalesce(mi.release_month::text, '') as release_month,
  coalesce(mi.release_day::text, '') as release_day,
  coalesce(mi.display_year::text, '') as display_year,
  coalesce(mi.display_month::text, '') as display_month,
  coalesce(mi.display_day::text, '') as display_day,
  coalesce(mi.display_combined_month::text, '') as display_combined_month,
  coalesce(mi.display_combined_day::text, '') as display_combined_day,
  coalesce(mi.publication_year::text, '') as publication_year,
  coalesce(mi.publication_month::text, '') as publication_month,
  coalesce(mi.publication_day::text, '') as publication_day,
  coalesce(mi.publication_combined_month::text, '') as publication_combined_month,
  coalesce(mi.publication_combined_day::text, '') as publication_combined_day,
  mi.volume_number,
  mi.issue_number,
  mi.total_issue_number,
  mi.issue_number_displayed,
  mi.sub_issue_number,
  mi.volume_issue_note,
  mi.publisher_name,
  mi.publishers::text as publishers_json,
  mi.publisher_person,
  mi.editor_person,
  mi.related_magazines::text as related_magazines_json,
  mi.binding,
  mi.magazine_code,
  to_jsonb(mi.category)::text as category_json,
  mi.rating,
  mi.price,
  mi.size,
  coalesce(mi.number_of_pages::text, '') as number_of_pages,
  mi.is_special_issue::text as is_special_issue,
  mi.is_mitsumine::text as is_mitsumine,
  mi.contents::text as contents,
  mi.note,
  coalesce(mi.source_work_count::text, '') as source_work_count,
  to_jsonb(mi.tags)::text as tags_json,
  mi.record_status,
  coalesce(mi.created_at::text, '') as created_at,
  coalesce(mi.updated_at::text, '') as updated_at,
  coalesce(mi.edit_version::text, '') as edit_version`;

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

const parseRequestMetadata = (value: string | null | undefined)=>{
    if (!value) return {} as Record<string, unknown>;
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
};

const parseRoleEntries = (value: string)=>{
    const parsedJson = parseJson<Array<Record<string, unknown>> | null>(value, null);
    if (Array.isArray(parsedJson)) {
        return parsedJson.map((entry)=>({
            role: String(entry.role ?? ""),
            name: String(entry.name ?? entry.title ?? ""),
            author_id: String(entry.author_id ?? entry.id ?? "")
        })).filter((entry)=>entry.role.trim() || entry.name.trim() || entry.author_id.trim());
    }
    return parseRoleNameText(value).map((entry)=>({
        role: entry.role,
        name: entry.name,
        author_id: ""
    })).filter((entry)=>entry.role.trim() || entry.name.trim());
};

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const sqlAuthUserRef = (value: string | null | undefined)=>{
    const normalized = String(value ?? "").trim();
    if (!normalized) return "null";
    return `${sqlString(normalized)}::uuid`;
};
const sqlJson = (value: unknown)=>`${sqlString(JSON.stringify(value))}::jsonb`;
const sqlNullableText = (value: string | null)=>value == null ? "null" : sqlString(value);
const sqlNullableInteger = (value: number | null)=>value == null ? "null" : String(value);
const sqlBoolean = (value: boolean)=>value ? "true" : "false";
const sqlTextArray = (values: string[])=>`array[${values.map(sqlString).join(", ")}]::text[]`;
const sleep = (milliseconds: number)=>new Promise((resolve)=>setTimeout(resolve, milliseconds));
const normalizeDebugDelayMs = (value: unknown)=>{
    if (process.env.NODE_ENV === "production") return 0;
    const delay = Number(value);
    if (!Number.isFinite(delay) || delay <= 0) return 0;
    return Math.min(Math.round(delay), 5000);
};

const normalizeMagazineId = (value: string | null)=>{
    const normalized = value?.trim() ?? "";
    if (!normalized) return "";
    return /^M[0-9]{6}$/.test(normalized) ? normalized : "";
};

const parseIssueLabelDisplayDate = (issueLabel: string)=>{
    const match = issueLabel.match(/(\d{4})年\s*(\d{1,2})月/);
    if (!match) {
        return {
            year: "",
            month: "",
            day: ""
        };
    }
    return {
        year: String(Number(match[1])),
        month: String(Number(match[2])),
        day: ""
    };
};

const parseIntegerValue = (value: PatchValue, label: string, options: { min?: number; max?: number; nullable?: boolean } = {})=>{
    if (value == null || value === "") {
        if (options.nullable ?? true) return null;
        throw new Error(`${label}は必須です`);
    }
    const text = String(value).trim();
    if (!/^-?\d+$/.test(text)) throw new Error(`${label}は整数で入力してください`);
    const numberValue = Number(text);
    if (options.min != null && numberValue < options.min) throw new Error(`${label}が範囲外です`);
    if (options.max != null && numberValue > options.max) throw new Error(`${label}が範囲外です`);
    return numberValue;
};

const parseTextArrayValue = (value: PatchValue)=>{
    const text = String(value ?? "").trim();
    if (!text) return [];
    return text.split(/[,\u3001]/).map((part)=>part.trim()).filter(Boolean);
};

const parseJsonArrayValue = (value: PatchValue, label: string)=>{
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

type NormalizedReferenceRow = {
    role: string;
    name: string;
    reading: string;
    keyValue: string;
    idValue: string;
};

const parseBooleanValue = (value: PatchValue)=>{
    if (typeof value === "boolean") return value;
    return String(value ?? "").trim() === "true";
};

const normalizeRequiredText = (value: PatchValue, label: string)=>{
    const text = String(value ?? "").trim();
    if (!text) throw new Error(`${label}は必須です`);
    return text;
};

const normalizeText = (value: PatchValue)=>String(value ?? "").trim();

const normalizeReading = (value: PatchValue)=>{
    const text = String(value ?? "").trim();
    return text || "みていぎ";
};

const normalizeReferenceRows = (
    value: PatchValue,
    label: string,
    keyField: "publisher_key" | "magazine_key",
    idField: "publisher_id" | "magazine_id"
): NormalizedReferenceRow[]=>{
    const rows = parseJsonArrayValue(value, label);
    return rows.map((row)=>{
        if (!row || typeof row !== "object") {
            return {
                role: "",
                name: "",
                reading: "",
                keyValue: "",
                idValue: ""
            };
        }
        const record = row as Record<string, unknown>;
        return {
            role: String(record.role ?? "").trim(),
            name: String(record.name ?? "").trim(),
            reading: String(record.reading ?? "").trim(),
            keyValue: String(record[keyField] ?? "").trim(),
            idValue: String(record[idField] ?? "").trim()
        };
    }).filter((row)=>row.role || row.name || row.reading || row.keyValue || row.idValue);
};

const resolvePublisherJsonRows = async (value: PatchValue)=>{
    const rows = normalizeReferenceRows(value, "出版社", "publisher_key", "publisher_id");
    if (rows.length === 0) return [];

    const publisherKeys = Array.from(new Set(rows.map((row)=>row.keyValue).filter(Boolean)));
    const publisherIds = Array.from(new Set(rows.map((row)=>row.idValue).filter(Boolean)));
    const conditions = [
        publisherKeys.length > 0 ? `p.id in (${publisherKeys.map(sqlString).join(", ")})` : "",
        publisherIds.length > 0 ? `p.publisher_id in (${publisherIds.map(sqlString).join(", ")})` : ""
    ].filter(Boolean);
    const resolvedRows = conditions.length > 0 ? await queryRows(`
select
  p.id,
  p.publisher_id,
  p.publisher_name,
  p.publisher_reading
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
        const resolved = (row.keyValue ? byKey.get(row.keyValue) : undefined) ?? (row.idValue ? byId.get(row.idValue) : undefined);
        return {
            role: row.role,
            name: row.name || resolved?.publisher_name || "",
            reading: row.reading || resolved?.publisher_reading || "",
            publisher_key: resolved?.id ?? row.keyValue,
            publisher_id: resolved?.publisher_id ?? row.idValue
        };
    });
};

const resolveRelatedMagazineJsonRows = async (value: PatchValue)=>{
    const rows = normalizeReferenceRows(value, "関連誌", "magazine_key", "magazine_id");
    if (rows.length === 0) return [];

    const magazineKeys = Array.from(new Set(rows.map((row)=>row.keyValue).filter(Boolean)));
    const magazineIds = Array.from(new Set(rows.map((row)=>row.idValue).filter(Boolean)));
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
        const resolved = (row.keyValue ? byKey.get(row.keyValue) : undefined) ?? (row.idValue ? byId.get(row.idValue) : undefined);
        return {
            role: row.role,
            name: row.name || resolved?.title || "",
            reading: row.reading || resolved?.title_reading || "",
            magazine_key: resolved?.id ?? row.keyValue,
            magazine_id: resolved?.magazine_id ?? row.idValue
        };
    });
};

const toIssueDate = (year: string, month: string, day: string)=>{
    if (!year || !month || !day) return null;
    const monthText = String(Number(month)).padStart(2, "0");
    const dayText = String(Number(day)).padStart(2, "0");
    return `${year}-${monthText}-${dayText}`;
};

const storyTypeLabels: Record<string, string> = {
    serial: "連載",
    one_shot: "読み切り",
    extra: "特別編",
    side_story: "外伝",
    unknown: "不明"
};

const contentTypeLabels: Record<string, string> = {
    cover: "表紙",
    back_cover: "裏表紙",
    toc: "目次",
    advertisement: "広告",
    article: "記事",
    gravure: "グラビア",
    pinup: "ピンナップ",
    reader_page: "読者ページ",
    preview: "予告",
    announcement: "告知",
    editorial_note: "編集後記",
    prize: "懸賞",
    appendix: "付録",
    other: "その他"
};
const contentTypeValues = Object.fromEntries(Object.entries(contentTypeLabels).map(([value, label])=>[
    label,
    value
]));

const normalizeContentContributorRole = (role: string, contentType: string)=>{
    if (contentType === "cover" && (role === "表紙" || role === "表紙イラスト")) return "イラスト";
    return role;
};

const parseOptionalPositiveInteger = (value: unknown, label: string)=>{
    if (value == null || value === "") return null;
    const text = String(value).trim();
    if (!text) return null;
    if (!/^\d+$/.test(text)) throw new Error(`${label}は整数で入力してください`);
    const numberValue = Number(text);
    if (numberValue <= 0) throw new Error(`${label}は1以上で入力してください`);
    return numberValue;
};

const normalizeContentType = (value: unknown)=>{
    const text = String(value ?? "").trim();
    if (!text) return "other";
    return contentTypeValues[text] ?? text;
};

const normalizeContentTypeLabel = (value: unknown)=>{
    const text = String(value ?? "").trim();
    const typeValue = normalizeContentType(text);
    return contentTypeLabels[typeValue] ?? text;
};

const normalizeContentRows = (value: unknown)=>{
    if (!Array.isArray(value)) throw new Error("コンテンツは配列として保存できません");
    return value.map((row, index)=>{
        if (!row || typeof row !== "object") throw new Error("コンテンツ行の形式が不正です");
        const record = row as Partial<ContentRow>;
        const contentType = normalizeContentType(record.contentType);
        const contentLabel = normalizeContentTypeLabel(record.contentType);
        const contributors = parseRoleEntries(String(record.contributorsJson ?? "")).map((contributor)=>({
            role: normalizeContentContributorRole(contributor.role.trim(), contentType),
            name: contributor.name.trim(),
            author_id: contributor.author_id.trim()
        })).filter((contributor)=>contributor.name || contributor.author_id);
        return {
            position: index + 1,
            content_type: contentType,
            title: contentLabel,
            contributors,
            story_id: null,
            story_candidate: null,
            page_start: parseOptionalPositiveInteger(record.pageStart, `コンテンツ${index + 1}行目: SP`),
            page_end: parseOptionalPositiveInteger(record.pageEnd, `コンテンツ${index + 1}行目: EP`),
            color_info: "",
            memo: String(record.detail ?? "").trim()
        };
    });
};

const formatContentContributors = (contributors: Array<Record<string, unknown>>, contentType: string)=>{
    return contributors.map((contributor)=>{
        const role = normalizeContentContributorRole(String(contributor.role ?? "").trim(), contentType);
        const name = String(contributor.name ?? "").trim();
        if (!name) return "";
        return role ? `[${role}]${name}` : name;
    }).filter(Boolean).join("、");
};

const rowContentsToContentRows = (value: string | null | undefined): ContentRow[]=>{
    const contents = parseJson<Array<Record<string, unknown>>>(value, []);
    return contents.map((content, index)=> {
        const contentType = String(content.content_type ?? "");
        const contributors = Array.isArray(content.contributors)
            ? content.contributors as Array<Record<string, unknown>>
            : [];
        return {
            position: Number(content.position) || index + 1,
            contentType: contentTypeLabels[contentType] ?? contentType ?? "その他",
            pageStart: content.page_start == null ? "" : String(content.page_start),
            pageEnd: content.page_end == null ? "" : String(content.page_end),
            detail: String(content.memo ?? "").trim(),
            contributorsJson: formatContentContributors(contributors, contentType)
        };
    }).sort((left, right)=>left.position - right.position).map((row, index)=>({
        ...row,
        position: index + 1
    }));
};

const rowToStory = (row: Record<string, string | null>, position: number): StoryRow=>{
    const contributors = parseJson<Array<Record<string, unknown>>>(row.contributors, []);
    const authors = contributors.map((contributor)=>({
        role: String(contributor.role ?? "著"),
        name: String(contributor.name ?? ""),
        reading: "",
        author_id: String(contributor.author_id ?? "")
    })).filter((contributor)=>contributor.name || contributor.author_id);

    return {
        storyId: row.story_id ?? "",
        position,
        title: row.title ?? "",
        titleReading: row.title_reading ?? "みていぎ",
        authors: JSON.stringify(authors),
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

const formatIssueDateLabel = (row: Record<string, string | null>)=>{
    const displayDate = parseIssueLabelDisplayDate(row.issue_label ?? "");
    const year = row.display_year || displayDate.year || row.year || "";
    const month = row.display_month || displayDate.month || row.month || "";
    const day = row.display_day || displayDate.day || "";
    if (!year) return "";
    const yearText = `${year}年`;
    const monthText = month ? `${String(Number(month)).padStart(2, "0")}月` : "";
    const dayText = day ? `${String(Number(day)).padStart(2, "0")}日` : "";
    const suffix = monthText && !dayText ? "号" : "";
    return `(${[yearText, monthText, dayText].filter(Boolean).join("")}${suffix})`;
};

const buildIssueVolumeLabel = (row: Record<string, string | null>)=>{
    const volumeText = (row.volume_number ?? "").trim();
    const issueText = (row.issue_number ?? "").trim();
    const totalText = (row.total_issue_number ?? "").trim();
    const volumeIssue = volumeText && issueText ? `（${volumeText}-${issueText}）` : "";
    const total = totalText ? `通巻${totalText}` : "";
    const displayed = row.issue_number_displayed ? `Vol.${row.issue_number_displayed}` : "";
    const kgtText = volumeIssue && total ? `${volumeIssue}${total}` : volumeIssue || total;
    return [kgtText, displayed].filter(Boolean).join(" ");
};

const buildIssueLabel = (row: Record<string, string | null>)=>{
    const title = row.issue_title || row.magazine_title || "";
    return [
        `${title}${formatIssueDateLabel(row)}`,
        buildIssueVolumeLabel(row)
    ].filter(Boolean).join(" ");
};

const getMagazineIdFromApplicationRequest = (requestRow: { routePath: string; metadata: Record<string, unknown> })=>{
    const metadataMagazineId = String(requestRow.metadata.magazineId ?? "").trim();
    if (metadataMagazineId) return metadataMagazineId;
    const match = requestRow.routePath.match(/\/magazines\/(M\d{6})\//);
    return match?.[1] ?? "";
};

const normalizeApplicationStoryRows = (value: unknown): StoryRow[]=>{
    if (!Array.isArray(value)) return [];
    return value.map((item, index)=>{
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const positionValue = Number(row.position ?? index + 1);
        return {
            storyId: String(row.storyId ?? "").trim(),
            position: Number.isFinite(positionValue) && positionValue > 0 ? positionValue : index + 1,
            title: String(row.title ?? "").trim(),
            titleReading: String(row.titleReading ?? "").trim(),
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

const normalizeApplicationContentRows = (value: unknown): ContentRow[]=>{
    if (!Array.isArray(value)) return [];
    return value.map((item, index)=>{
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const positionValue = Number(row.position ?? index + 1);
        return {
            clientKey: String(row.clientKey ?? "").trim() || undefined,
            position: Number.isFinite(positionValue) && positionValue > 0 ? positionValue : index + 1,
            contentType: String(row.contentType ?? "").trim(),
            pageStart: String(row.pageStart ?? "").trim(),
            pageEnd: String(row.pageEnd ?? "").trim(),
            detail: String(row.detail ?? "").trim(),
            contributorsJson: typeof row.contributorsJson === "string" ? row.contributorsJson : JSON.stringify(row.contributorsJson ?? [])
        };
    }).filter((row)=>row.contentType || row.detail || row.contributorsJson !== "[]");
};

const buildApplicationIssue = (requestRow: {
    entityId: string;
    title: string;
    updatedAt: string;
    status?: string;
    metadata: Record<string, unknown>;
}, magazineId: string): ExistingIssue=>({
        id: requestRow.entityId,
        magazineId,
        date: "",
        label: String(requestRow.metadata.issueLabel ?? requestRow.title ?? "").trim() || requestRow.title,
        title: String(requestRow.metadata.issueTitle ?? requestRow.title ?? "").trim() || requestRow.title,
        digest: String(requestRow.metadata.digest ?? "申請中").trim() || "申請中",
        status: requestRow.status ?? String(requestRow.metadata.recordStatus ?? "draft"),
        updatedAt: requestRow.updatedAt,
        magazineTitle: String(requestRow.metadata.magazineTitle ?? "").trim(),
        titleReading: String(requestRow.metadata.titleReading ?? "").trim(),
        publicationFrequency: String(requestRow.metadata.publicationFrequency ?? "").trim(),
        mediaFormat: String(requestRow.metadata.mediaFormat ?? "").trim(),
        subtitle: String(requestRow.metadata.subtitle ?? "").trim(),
        subtitleReading: String(requestRow.metadata.subtitleReading ?? "").trim(),
        volumeNumber: String(requestRow.metadata.volumeNumber ?? "").trim(),
        issueNumber: String(requestRow.metadata.issueNumber ?? "").trim(),
        totalIssueNumber: String(requestRow.metadata.totalIssueNumber ?? "").trim(),
        issueNumberDisplayed: String(requestRow.metadata.issueNumberDisplayed ?? "").trim(),
        subIssueNumber: String(requestRow.metadata.subIssueNumber ?? "").trim(),
        volumeIssueNote: String(requestRow.metadata.volumeIssueNote ?? "").trim(),
        publishersJson: JSON.stringify(Array.isArray(requestRow.metadata.publishers) ? requestRow.metadata.publishers : []),
        publisherName: String(requestRow.metadata.publisherName ?? "").trim(),
        relatedMagazinesJson: JSON.stringify(Array.isArray(requestRow.metadata.relatedMagazines) ? requestRow.metadata.relatedMagazines : []),
        binding: String(requestRow.metadata.binding ?? "").trim(),
        magazineCode: String(requestRow.metadata.magazineCode ?? "").trim(),
        category: Array.isArray(requestRow.metadata.category) ? requestRow.metadata.category.map((item)=>String(item).trim()).filter(Boolean) : [],
        rating: String(requestRow.metadata.rating ?? "").trim(),
        price: String(requestRow.metadata.price ?? "").trim(),
        size: String(requestRow.metadata.size ?? "").trim(),
        note: String(requestRow.metadata.memo ?? "").trim(),
        tag: Array.isArray(requestRow.metadata.tags) ? requestRow.metadata.tags.map((item)=>String(item).trim()).filter(Boolean) : [],
        isSpecialIssue: Boolean(requestRow.metadata.isSpecialIssue),
        isMitsumine: Boolean(requestRow.metadata.isMitsumine),
        stories: normalizeApplicationStoryRows(requestRow.metadata.stories),
        contents: normalizeApplicationContentRows(requestRow.metadata.contents)
    });

const buildIssueApplicationMetadata = (issue: ExistingIssue): Record<string, unknown>=>({
    magazineId: issue.magazineId,
    magazineTitle: issue.magazineTitle,
    issueTitle: issue.title,
    issueLabel: issue.label,
    titleReading: issue.titleReading,
    publicationFrequency: issue.publicationFrequency,
    mediaFormat: issue.mediaFormat,
    subtitle: issue.subtitle,
    subtitleReading: issue.subtitleReading,
    volumeNumber: issue.volumeNumber,
    issueNumber: issue.issueNumber,
    totalIssueNumber: issue.totalIssueNumber,
    issueNumberDisplayed: issue.issueNumberDisplayed,
    subIssueNumber: issue.subIssueNumber,
    volumeIssueNote: issue.volumeIssueNote,
    publishers: parseJson<unknown[]>(issue.publishersJson, []),
    publisherName: issue.publisherName,
    price: issue.price,
    size: issue.size,
    memo: issue.note,
    tags: issue.tag,
    relatedMagazines: parseJson<unknown[]>(issue.relatedMagazinesJson, []),
    binding: issue.binding,
    magazineCode: issue.magazineCode,
    category: issue.category,
    rating: issue.rating,
    isSpecialIssue: issue.isSpecialIssue,
    isMitsumine: issue.isMitsumine,
    digest: issue.digest,
    recordStatus: issue.status,
    stories: issue.stories ?? [],
    contents: issue.contents ?? [],
    sourceWorkCount: issue.stories?.length ?? 0,
    contentCount: issue.contents?.length ?? 0,
    sourceFirstWorkId: issue.stories?.[0]?.storyId ?? ""
});

const buildIssueRoutePath = (issue: { magazineId?: string; id: string })=>`/magazines/${issue.magazineId ?? ""}/issues/${issue.id}?from=issue-list`;

const upsertIssueSetDraftRequest = async ({
    currentUser,
    issue,
    requestedAction
}: {
    currentUser: Awaited<ReturnType<typeof getCurrentUserContext>>;
    issue: ExistingIssue;
    requestedAction: "create" | "update" | "delete";
})=>{
    const metadata = buildIssueApplicationMetadata(issue);
    const issueMagazineId = issue.magazineId ?? "";
    const parentRequest = issueMagazineId
        ? await loadActiveApplicationRequest(currentUser.id, "magazine_title", issueMagazineId)
        : null;
    if (parentRequest?.request_id && parentRequest.action === "create") {
        metadata.dependencyGroupId = issueMagazineId;
        metadata.dependencyGroupLabel = issue.magazineTitle || issue.title;
        metadata.dependsOnRequestIds = [parentRequest.request_id];
    }
    await upsertDraftApplicationRequest({
        currentUser,
        entityType: "magazine_issue_set",
        entityId: issue.id,
        title: issue.label,
        parentLabel: issue.magazineTitle || issue.title,
        requestedAction,
        routePath: buildIssueRoutePath(issue),
        metadata
    });
};

const normalizeIssueId = (value: unknown)=>{
    const normalized = String(value ?? "").trim();
    return /^MI[0-9]{7}$/.test(normalized) ? normalized : "";
};

const loadIssueRow = async (issueId: string)=>{
    const rows = await queryRows(`
select
${issueColumnSelect}
from public.magazine_issues mi
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
left join public.publishers p
  on p.id = mi.publisher_key
where mi.magazine_issue_id = ${sqlString(issueId)}
limit 1;
`);
    return rows[0];
};

const loadIssueRawSnapshot = async (issueId: string)=>{
    const rows = await queryRows(`
select
  to_jsonb(mi)::text as row_json
from public.magazine_issues mi
where mi.magazine_issue_id = ${sqlString(issueId)}
limit 1;
`);
    return rows[0]?.row_json ?? "{}";
};

const loadPublishedIssueStories = async (issueId: string)=>{
    const rows = await queryRows(`
select
  s.story_id,
  s.story_type,
  s.series_title,
  s.series_title_reading,
  s.episode_number,
  coalesce(s.episode_number_sort::text, '') as episode_number_sort,
  s.title,
  s.title_reading,
  s.subtitle,
  s.subtitle_reading,
  s.contributors::text as contributors,
  coalesce(s.page_count::text, '') as page_count,
  s.first_magazine_issue_id,
  s.color_info,
  s.memo,
  to_jsonb(s.tags)::text as tags_json,
  s.source_occurrences::text as source_occurrences
from public.stories s
where s.first_magazine_issue_id = ${sqlString(issueId)}
  and s.record_status = 'published'
  and coalesce(s.status, '') <> 'deleted'
order by
  case
    when s.source_occurrences->0->>'position' ~ '^[0-9]+$'
    then (s.source_occurrences->0->>'position')::integer
    else null
  end nulls last,
  s.story_id;
`);
    return rows.map((row, index)=>rowToStory(row, index + 1));
};

const getNextIssueId = async ()=>{
    const rows = await queryRows(`
select 'MI' || lpad((coalesce(max(substring(magazine_issue_id from 3)::integer), 0) + 1)::text, 7, '0') as magazine_issue_id
from public.magazine_issues
where magazine_issue_id ~ '^MI[0-9]{7}$';
`);
    return rows[0]?.magazine_issue_id ?? "";
};

const buildIssueSearchText = (row: Record<string, unknown>)=>[
    row.magazine_issue_id,
    row.magazine_id,
    row.issue_title,
    row.issue_title_reading,
    row.magazine_title,
    row.publisher_name,
    row.publication_frequency
].map((value)=>String(value ?? "").trim()).filter(Boolean).join(" ").slice(0, 1000);

const buildIssueSearchReading = (row: Record<string, unknown>)=>[
    row.issue_title_reading
].map((value)=>String(value ?? "").trim()).filter(Boolean).join(" ").slice(0, 1000);

const getPatchAssignments = async (field: string, value: PatchValue, beforeRow: Record<string, string | null>)=>{
    const text = normalizeText(value);
    const integer = (label: string, min = 0, max?: number)=>parseIntegerValue(value, label, {
            min,
            max
        });
    switch(field){
        case "issueTitle":
            return {
                issue_title: normalizeRequiredText(value, "雑誌個別の表記名")
            };
        case "titleReading":
            return {
                issue_title_reading: normalizeReading(value)
            };
        case "subtitle":
            return {
                subtitle: text
            };
        case "subtitleReading":
            return {
                subtitle_reading: normalizeReading(value)
            };
        case "publicationFrequency":
            return {
                publication_frequency: normalizeRequiredText(value, "刊行")
            };
        case "mediaFormat": {
            const mediaFormat = text;
            if (![
                "print",
                "digital",
                "print_and_digital",
                "unknown"
            ].includes(mediaFormat)) throw new Error("媒体の値が不正です");
            return {
                media_format: mediaFormat
            };
        }
        case "displayReleaseYear":
            return {
                display_year: integer("発売表示年")
            };
        case "displayReleaseMonth":
            return {
                display_month: integer("発売表示月", 1, 12)
            };
        case "displayReleaseDay":
            return {
                display_day: integer("発売表示日", 1, 31)
            };
        case "displayReleaseCombinedMonth":
            return {
                display_combined_month: integer("表示合併月", 1, 12)
            };
        case "displayReleaseCombinedDay":
            return {
                display_combined_day: integer("表示合併日", 1, 31)
            };
        case "publicationYear":
            return {
                publication_year: integer("発行年")
            };
        case "publicationMonth":
            return {
                publication_month: integer("発行月", 1, 12)
            };
        case "publicationDay":
            return {
                publication_day: integer("発行日", 1, 31)
            };
        case "publicationCombinedMonth":
            return {
                publication_combined_month: integer("発行合併月", 1, 12)
            };
        case "publicationCombinedDay":
            return {
                publication_combined_day: integer("発行合併日", 1, 31)
            };
        case "releaseYear":
            return {
                release_year: integer("発売年"),
                year: integer("発売年")
            };
        case "releaseMonth":
            return {
                release_month: integer("発売月", 1, 12),
                month: integer("発売月", 1, 12)
            };
        case "releaseDay":
            return {
                release_day: integer("発売日", 1, 31),
                day: integer("発売日", 1, 31)
            };
        case "volumeNumber":
            return {
                volume_number: text
            };
        case "issueNumber":
            return {
                issue_number: text
            };
        case "totalIssueNumber":
            return {
                total_issue_number: text
            };
        case "volumeNumberDisplayed":
            return {
                issue_number_displayed: text
            };
        case "issueNumberCombined":
            return {
                sub_issue_number: text
            };
        case "volumeIssueNote":
            return {
                volume_issue_note: text
            };
        case "publishersJson":
            {
                const publishers = await resolvePublisherJsonRows(value);
                const primaryPublisher = publishers.find((publisher)=>publisher.publisher_key || publisher.publisher_id);
                return {
                    publishers,
                    publisher_key: primaryPublisher?.publisher_key || beforeRow.publisher_key || "",
                    publisher_id: primaryPublisher?.publisher_id || beforeRow.publisher_id || "",
                    publisher_name: publishers[0]?.name || beforeRow.publisher_name || ""
                };
            }
        case "publisherPerson":
            return {
                publisher_person: text
            };
        case "editorPerson":
            return {
                editor_person: text
            };
        case "relatedMagazinesJson":
            return {
                related_magazines: await resolveRelatedMagazineJsonRows(value)
            };
        case "binding":
            return {
                binding: text
            };
        case "magazineCode":
            return {
                magazine_code: text
            };
        case "category":
            return {
                category: parseTextArrayValue(value)
            };
        case "rating":
            return {
                rating: text
            };
        case "price":
            return {
                price: text
            };
        case "size":
            return {
                size: text
            };
        case "numberOfPages":
            return {
                number_of_pages: parseIntegerValue(value, "ページ数", {
                    min: 1
                })
            };
        case "isSpecialIssue":
            return {
                is_special_issue: parseBooleanValue(value)
            };
        case "isMitsumine":
            return {
                is_mitsumine: parseBooleanValue(value)
            };
        case "note":
            return {
                note: String(value ?? "")
            };
        case "tag":
            return {
                tags: parseTextArrayValue(value)
            };
        case "contents":
            return {
                contents: normalizeContentRows(value)
            };
        default:
            throw new Error("保存対象外の項目です");
    }
};

const toPatchSqlValue = (column: string, value: unknown)=>{
    if (value == null) return "null";
    if (typeof value === "boolean") return sqlBoolean(value);
    if (typeof value === "number") return sqlNullableInteger(value);
    if (Array.isArray(value)) {
        return column === "category" || column === "tags" ? sqlTextArray(value.map(String)) : sqlJson(value);
    }
    return sqlNullableText(String(value));
};

const mergePatchRow = (row: Record<string, string | null>, assignments: Record<string, unknown>)=>{
    const nextRow = {
        ...row
    };
    for (const [column, value] of Object.entries(assignments)) {
        if (Array.isArray(value)) {
            nextRow[column] = JSON.stringify(value);
        } else if (value == null) {
            nextRow[column] = "";
        } else {
            nextRow[column] = String(value);
        }
    }
    return nextRow;
};

const buildIssueDigest = (row: Record<string, string | null>)=>{
    const workCount = row.source_work_count ? `作品 ${row.source_work_count}件` : "";
    return [
        buildIssueVolumeLabel(row),
        workCount
    ].filter(Boolean).join(" ");
};

const rowToIssue = (row: Record<string, string | null>, stories: StoryRow[] = []): ExistingIssue=> {
    const publisherId = row.publisher_id ?? "";
    const publisherName = row.publisher_name || row.resolved_publisher_name || "出版社不明";
    const publisherReading = row.publisher_reading || "しゅっぱんしゃふめい";
    const displayDate = parseIssueLabelDisplayDate(row.issue_label ?? "");
    const fallbackPublishersJson = JSON.stringify([
        {
            role: "発行",
            name: publisherName,
            reading: publisherReading,
            publisher_key: row.publisher_key ?? "",
            publisher_id: publisherId
        }
    ]);
    return {
        id: row.magazine_issue_id ?? "",
        magazineId: row.magazine_id ?? "",
        date: row.published_date ?? "",
        label: buildIssueLabel(row),
        title: row.issue_title || row.magazine_title || "",
        digest: buildIssueDigest(row),
        status: row.record_status ?? "published",
        createdAt: row.created_at ?? "",
        updatedAt: row.updated_at ?? "",
        magazineTitle: row.magazine_title ?? "",
        titleReading: row.issue_title_reading || row.title_reading || "",
        publicationFrequency: row.publication_frequency ?? "月刊",
        mediaFormat: row.media_format ?? "unknown",
        year: row.release_year || row.year || "",
        month: row.release_month || row.month || "",
        day: row.release_day || row.day || "",
        displayYear: row.display_year || displayDate.year,
        displayMonth: row.display_month || displayDate.month,
        displayDay: row.display_day || displayDate.day,
        displayCombinedMonth: row.display_combined_month ?? "",
        displayCombinedDay: row.display_combined_day ?? "",
        publicationYear: row.publication_year ?? "",
        publicationMonth: row.publication_month ?? "",
        publicationDay: row.publication_day ?? "",
        publicationCombinedMonth: row.publication_combined_month ?? "",
        publicationCombinedDay: row.publication_combined_day ?? "",
        subtitle: row.subtitle ?? "",
        subtitleReading: row.subtitle_reading ?? "みていぎ",
        volumeNumber: row.volume_number ?? "",
        issueNumber: row.issue_number ?? "",
        totalIssueNumber: row.total_issue_number ?? "",
        issueNumberDisplayed: row.issue_number_displayed ?? "",
        subIssueNumber: row.sub_issue_number ?? "",
        volumeIssueNote: row.volume_issue_note ?? "",
        publishersJson: row.publishers_json && row.publishers_json !== "[]" ? row.publishers_json : fallbackPublishersJson,
        publisherPerson: row.publisher_person ?? "",
        editorPerson: row.editor_person ?? "",
        relatedMagazinesJson: row.related_magazines_json ?? "[]",
        binding: row.binding ?? "",
        magazineCode: row.magazine_code ?? "",
        category: parseJson<string[]>(row.category_json, []),
        rating: row.rating ?? "",
        publisherName,
        price: row.price ?? "",
        size: row.size ?? "",
        numberOfPages: row.number_of_pages ?? "",
        isSpecialIssue: row.is_special_issue === "true",
        isMitsumine: row.is_mitsumine === "true",
        note: row.note ?? "",
        tag: parseJson<string[]>(row.tags_json, []),
        stories,
        contents: rowContentsToContentRows(row.contents)
    };
};

const loadIssueDeleteTarget = async (issueId: string)=>{
    const rows = await queryRows(`
select
  mi.id,
  mi.magazine_issue_id,
  mi.magazine_id,
  mi.magazine_key,
  mt.title as magazine_title,
  mi.issue_label,
  mi.contents::text as contents_json,
  mi.record_status
from public.magazine_issues mi
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
where mi.magazine_issue_id = ${sqlString(issueId)}
limit 1;
`);
    return rows[0];
};

const loadIssueLinkedStories = async (issueId: string, issueKey: string)=>{
    return await queryRows(`
select
  s.story_id,
  s.id,
  s.title,
  s.first_magazine_issue_id,
  s.first_magazine_issue_key,
  s.source_occurrences::text as source_occurrences
from public.stories s
where s.record_status = 'published'
  and coalesce(s.status, '') <> 'deleted'
  and (
    s.first_magazine_issue_id = ${sqlString(issueId)}
    or s.first_magazine_issue_key = ${sqlString(issueKey)}
  )
order by s.story_id;
`);
};

export async function GET(request: NextRequest) {
    try {
        const magazineId = normalizeMagazineId(request.nextUrl.searchParams.get("magazineId"));
        if (request.nextUrl.searchParams.has("magazineId") && !magazineId) {
            return NextResponse.json({
                error: "invalid magazineId"
            }, {
                status: 400
            });
        }

        const countRows = await queryRows(`
select
  magazine_id,
  count(*)::text as issue_count
from public.magazine_issues
where record_status = 'published'
group by magazine_id
order by magazine_id;
`);
        const countsMap = new Map(countRows.map((row)=>[
                row.magazine_id ?? "",
                Number(row.issue_count ?? "0")
            ]));
        const counts: IssueCount[] = countRows.map((row)=>({
            magazineId: row.magazine_id ?? "",
            count: Number(row.issue_count ?? "0")
        })).filter((row)=>row.magazineId);
        const { items: visibleIssueRequests } = await loadVisibleApplicationRequests(request, "magazine_issue_set");

        const issueRows = magazineId ? await queryRows(`
select
${issueColumnSelect}
from public.magazine_issues mi
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
left join public.publishers p
  on p.id = mi.publisher_key
where mi.record_status = 'published'
  and mi.magazine_id = ${sqlString(magazineId)}
order by mi.published_date desc nulls last, mi.magazine_issue_id desc;
`) : [];
        const storiesByIssueId = new Map<string, StoryRow[]>();
        if (magazineId && issueRows.length > 0) {
            const storyRows = await queryRows(`
select
  s.story_id,
  s.story_type,
  s.series_title,
  s.series_title_reading,
  s.episode_number,
  coalesce(s.episode_number_sort::text, '') as episode_number_sort,
  s.title,
  s.title_reading,
  s.subtitle,
  s.subtitle_reading,
  s.contributors::text as contributors,
  coalesce(s.page_count::text, '') as page_count,
  s.first_magazine_issue_id,
  s.color_info,
  s.memo,
  to_jsonb(s.tags)::text as tags_json
from public.stories s
join public.magazine_issues mi
  on mi.id = s.first_magazine_issue_key
where s.record_status = 'published'
  and s.status <> 'deleted'
  and mi.record_status = 'published'
  and mi.magazine_id = ${sqlString(magazineId)}
order by
  s.first_magazine_issue_id,
  case
    when s.source_occurrences->0->>'position' ~ '^[0-9]+$'
    then (s.source_occurrences->0->>'position')::integer
    else null
  end nulls last,
  s.story_id;
`);
            for (const storyRow of storyRows) {
                const issueId = storyRow.first_magazine_issue_id ?? "";
                if (!issueId) continue;
                const rows = storiesByIssueId.get(issueId) ?? [];
                rows.push(rowToStory(storyRow, rows.length + 1));
                storiesByIssueId.set(issueId, rows);
            }
        }
        const issuesMap = new Map(issueRows.map((row)=>[
                row.magazine_issue_id ?? "",
                rowToIssue(row, storiesByIssueId.get(row.magazine_issue_id ?? "") ?? []),
            ]));
        for (const requestRow of visibleIssueRequests) {
            const requestMagazineId = getMagazineIdFromApplicationRequest(requestRow);
            if (magazineId && requestMagazineId !== magazineId) continue;
            if (!requestRow.entityId) continue;
            const existingIssue = issuesMap.get(requestRow.entityId);
            if (existingIssue) {
                const requestIssue = buildApplicationIssue(requestRow, requestMagazineId || existingIssue.magazineId || "");
                const requestHasStories = Object.prototype.hasOwnProperty.call(requestRow.metadata, "stories");
                const requestHasContents = Object.prototype.hasOwnProperty.call(requestRow.metadata, "contents");
                issuesMap.set(requestRow.entityId, {
                    ...existingIssue,
                    ...requestIssue,
                    magazineId: existingIssue.magazineId,
                    status: existingIssue.status,
                    magazineTitle: requestIssue.magazineTitle || existingIssue.magazineTitle,
                    date: existingIssue.date,
                    digest: requestIssue.digest || existingIssue.digest,
                    stories: requestHasStories ? requestIssue.stories : existingIssue.stories,
                    contents: requestHasContents ? requestIssue.contents : existingIssue.contents
                });
                continue;
            }
            if (!requestMagazineId) continue;
            issuesMap.set(requestRow.entityId, buildApplicationIssue(requestRow, requestMagazineId));
            countsMap.set(requestMagazineId, (countsMap.get(requestMagazineId) ?? 0) + 1);
        }
        const issues = Array.from(issuesMap.values()).sort((left, right)=>(
                (right.date || "").localeCompare(left.date || "", "ja")
                || right.id.localeCompare(left.id, "ja")
            ));
        const mergedCounts = Array.from(countsMap.entries()).map(([magazineIdValue, count])=>({
                magazineId: magazineIdValue,
                count
            })).filter((row)=>row.magazineId);

        return NextResponse.json({
            counts: mergedCounts,
            issues
        });
    } catch (error) {
        return createRouteErrorResponse(error, "failed to load magazine issues", {
            databaseMessage: "データベースに接続できないため雑誌個別データを読み込めません。"
        });
    }
}

export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as PostBody;
        const magazineId = normalizeMagazineId(typeof body.magazineId === "string" ? body.magazineId : null);
        if (!magazineId) {
            return NextResponse.json({
                error: "invalid magazineId"
            }, {
                status: 400
            });
        }

        const issueTitle = normalizeRequiredText(body.issueTitle as PatchValue, "雑誌個別の表記名");
        const titleReading = normalizeReading(body.titleReading as PatchValue);
        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const magazineRows = await queryRows(`
select
  mt.id,
  mt.magazine_id,
  mt.title,
  coalesce(mt.title_reading, '') as title_reading,
  coalesce(mt.publication_frequency::text, '[]') as publication_frequency_json,
  p.id as publisher_key,
  p.publisher_id,
  coalesce(p.publisher_name, '出版社不明') as publisher_name,
  coalesce(p.publisher_reading, 'しゅっぱんしゃふめい') as publisher_reading
from public.magazine_titles mt
left join public.publishers p
  on p.id = mt.publisher_key
where ${currentUser.role === "super_admin" ? "mt.record_status = 'published'" : "mt.record_status <> 'deleted'"}
  and mt.magazine_id = ${sqlString(magazineId)}
limit 1;
`);
        const magazineRow = magazineRows[0];
        if (!magazineRow?.id || !magazineRow?.publisher_key || !magazineRow?.publisher_id) {
            return NextResponse.json({
                error: "magazine title not found"
            }, {
                status: 404
            });
        }

        const magazineIssueId = await getNextIssueId();
        if (!magazineIssueId) throw new Error("new magazine issue id could not be generated");
        const issueKey = createInternalId("mi");
        const publicationFrequencyList = parseJson<string[]>(magazineRow.publication_frequency_json, []);
        const publicationFrequency = publicationFrequencyList[0] ?? "月刊";
        const publishers = [
            {
                role: "発行",
                name: magazineRow.publisher_name ?? "出版社不明",
                reading: magazineRow.publisher_reading ?? "しゅっぱんしゃふめい",
                publisher_key: magazineRow.publisher_key,
                publisher_id: magazineRow.publisher_id
            }
        ];
        const labelRow = {
            issue_title: issueTitle,
            magazine_title: magazineRow.title ?? "",
            issue_label: "",
            display_year: "",
            year: "",
            display_month: "",
            month: "",
            display_day: "",
            volume_number: "",
            issue_number: "",
            total_issue_number: "",
            issue_number_displayed: ""
        } as Record<string, string | null>;
        const issueLabel = buildIssueLabel(labelRow);
        const searchRow = {
            magazine_issue_id: magazineIssueId,
            magazine_id: magazineId,
            issue_title: issueTitle,
            issue_title_reading: titleReading,
            magazine_title: magazineRow.title ?? "",
            publisher_name: magazineRow.publisher_name ?? "出版社不明",
            publication_frequency: publicationFrequency
        };

        await queryRows(`
insert into public.magazine_issues (
  id,
  magazine_issue_id,
  source_issue_key,
  magazine_id,
  magazine_key,
  publisher_id,
  publisher_key,
  issue_title,
  issue_title_reading,
  issue_label,
  publication_frequency,
  media_format,
  publisher_name,
  publishers,
  subtitle,
  subtitle_reading,
  volume_number,
  issue_number,
  total_issue_number,
  issue_number_displayed,
  sub_issue_number,
  volume_issue_note,
  price,
  size,
  contents,
  note,
  source_work_count,
  source_first_work_id,
  tags,
  related_magazines,
  binding,
  magazine_code,
  category,
  rating,
  is_special_issue,
  is_mitsumine,
  search_text,
  search_reading,
  record_status,
  owner_user_id,
  created_by,
  updated_by,
  approved_by
) values (
  ${sqlString(issueKey)},
  ${sqlString(magazineIssueId)},
  ${sqlString(issueKey)},
  ${sqlString(magazineId)},
  ${sqlString(magazineRow.id)},
  ${sqlString(magazineRow.publisher_id)},
  ${sqlString(magazineRow.publisher_key)},
  ${sqlString(issueTitle)},
  ${sqlString(titleReading)},
  ${sqlString(issueLabel)},
  ${sqlString(publicationFrequency)},
  'print',
  ${sqlString(magazineRow.publisher_name ?? "出版社不明")},
  ${sqlJson(publishers)},
  '',
  'みていぎ',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '[]'::jsonb,
  '',
  0,
  '',
  array[]::text[],
  '[]'::jsonb,
  '',
  '',
  array[]::text[],
  '',
  false,
  false,
  ${sqlString(buildIssueSearchText(searchRow))},
  ${sqlString(buildIssueSearchReading(searchRow))},
  ${sqlString(currentUser.role === "super_admin" ? "published" : "draft")},
  ${sqlAuthUserRef(currentUser.id)},
  ${sqlAuthUserRef(currentUser.id)},
  ${sqlAuthUserRef(currentUser.id)},
  ${currentUser.role === "super_admin" ? sqlAuthUserRef(currentUser.id) : "null"}
);
`);

        const insertedRow = await loadIssueRow(magazineIssueId);
        if (!insertedRow) throw new Error("created magazine issue could not be loaded");
        const insertedIssue = rowToIssue(insertedRow);

        if (currentUser.role !== "super_admin") {
            await upsertIssueSetDraftRequest({
                currentUser,
                issue: insertedIssue,
                requestedAction: "create"
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
  'magazine_issues',
  ${sqlString(magazineIssueId)},
  ${sqlString(insertedRow.issue_label ?? issueLabel)},
  '{}'::jsonb,
  ${sqlJson({
            row: insertedRow
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_save" : "editor_draft_create")}
);
`);

        return NextResponse.json({
            issue: insertedIssue
        }, {
            status: 201
        });
    } catch (error) {
        return createRouteErrorResponse(error, "failed to create magazine issue", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json() as PatchBody;
        const issueId = normalizeIssueId(body.issueId);
        const field = String(body.field ?? "").trim();
        const undoMeta = normalizeUndoMetadata(body.undoMeta);
        if (!issueId) {
            return NextResponse.json({
                error: "invalid issueId"
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
        const beforeRows = await queryRows(`
select
${issueColumnSelect}
from public.magazine_issues mi
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
left join public.publishers p
  on p.id = mi.publisher_key
where ${currentUser.role === "super_admin" ? "mi.record_status = 'published'" : "mi.record_status <> 'deleted'"}
  and mi.magazine_issue_id = ${sqlString(issueId)}
limit 1;
`);
        const beforeRow = beforeRows[0];
        const beforeRawSnapshot = await loadIssueRawSnapshot(issueId);
        if (!beforeRow) {
            return NextResponse.json({
                error: "magazine issue not found"
            }, {
                status: 404
            });
        }
        const activeIssueRequest = currentUser.role !== "super_admin"
            ? await ensureEditableIssueRequestStatus(currentUser.id, issueId)
            : null;

        const assignments: Record<string, unknown> = await getPatchAssignments(field, body.value ?? null, beforeRow);
        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const nextRowForLabel = mergePatchRow(beforeRow, assignments);
        assignments.issue_label = buildIssueLabel(nextRowForLabel);
        if (field === "releaseYear" || field === "releaseMonth" || field === "releaseDay") {
            assignments.published_date = toIssueDate(
                nextRowForLabel.release_year || nextRowForLabel.year || "",
                nextRowForLabel.release_month || nextRowForLabel.month || "",
                nextRowForLabel.release_day || nextRowForLabel.day || ""
            );
        }
        const isPublishedSource = beforeRow.record_status === "published";
        const requestMetadata = currentUser.role !== "super_admin" && isPublishedSource
            ? parseRequestMetadata(activeIssueRequest?.metadata_json ?? null)
            : {};
        const hasDraftIssueMetadata = currentUser.role !== "super_admin" && isPublishedSource && Object.keys(requestMetadata).length > 0;
        const requestStories = currentUser.role !== "super_admin" && isPublishedSource
            ? Object.prototype.hasOwnProperty.call(requestMetadata, "stories")
                ? normalizeApplicationStoryRows(requestMetadata.stories)
                : await loadPublishedIssueStories(issueId)
            : [];
        const requestContents = currentUser.role !== "super_admin" && isPublishedSource
            ? Object.prototype.hasOwnProperty.call(requestMetadata, "contents")
                ? normalizeApplicationContentRows(requestMetadata.contents)
                : rowContentsToContentRows(beforeRow.contents)
            : [];
        const beforeRequestIssue = currentUser.role !== "super_admin" && isPublishedSource
            ? hasDraftIssueMetadata
                ? buildApplicationIssue({
                    entityId: issueId,
                    title: beforeRow.issue_label ?? issueId,
                    updatedAt: beforeRow.updated_at ?? "",
                    status: activeIssueRequest?.status ?? undefined,
                    metadata: {
                        ...requestMetadata,
                        stories: requestStories,
                        contents: requestContents
                    }
                }, beforeRow.magazine_id ?? "")
                : {
                ...rowToIssue(beforeRow, requestStories),
                contents: requestContents
            }
            : null;
        if (currentUser.role !== "super_admin" && !isPublishedSource) {
            assignments.record_status = "draft";
            assignments.approved_at = null;
        }

        if (currentUser.role === "super_admin" || !isPublishedSource) {
            const setSql = Object.entries(assignments).map(([column, value])=>`${column} = ${toPatchSqlValue(column, value)}`).join(",\n  ");
            await queryRows(`
update public.magazine_issues
set
  ${setSql},
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(currentUser.id)}),
  updated_by = ${sqlAuthUserRef(currentUser.id)}
where magazine_issue_id = ${sqlString(issueId)}
  and ${currentUser.role === "super_admin" ? "record_status = 'published'" : "record_status <> 'deleted'"}
returning magazine_issue_id;
`);
        }

        const updatedRows = await queryRows(`
select
${issueColumnSelect}
from public.magazine_issues mi
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
left join public.publishers p
  on p.id = mi.publisher_key
where mi.magazine_issue_id = ${sqlString(issueId)}
limit 1;
`);
        const updatedRow = updatedRows[0];
        const afterRawSnapshot = await loadIssueRawSnapshot(issueId);
        const responseIssue = currentUser.role !== "super_admin" && isPublishedSource
            ? {
                ...rowToIssue(mergePatchRow(beforeRow, assignments), requestStories),
                contents: field === "contents"
                    ? normalizeApplicationContentRows(body.value ?? [])
                    : requestContents
            }
            : updatedRow
                ? rowToIssue(updatedRow)
                : null;
        if (!responseIssue) {
            throw new Error("updated magazine issue could not be loaded");
        }

        if (currentUser.role !== "super_admin") {
            await upsertIssueSetDraftRequest({
                currentUser,
                issue: responseIssue,
                requestedAction: isPublishedSource ? "update" : "create"
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
  'magazine_issues',
  ${sqlString(issueId)},
  ${sqlString(responseIssue.label ?? updatedRow?.issue_label ?? "")},
  ${sqlJson({
            field,
            row: beforeRow
        })},
  ${sqlJson({
            field,
            assignments,
            row: currentUser.role !== "super_admin" && isPublishedSource ? mergePatchRow(beforeRow, assignments) : updatedRow
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_save" : "editor_draft_save")}
);
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
  ${sqlString(currentUser.id)}::uuid,
  ${sqlString(currentUser.id)}::uuid,
  'undo_action',
  'magazine_issue',
  ${sqlString(issueId)},
  ${sqlJson({
            kind: field === "contents" ? "content" : "issue",
            field,
            issueId,
            label: field === "contents" ? "コンテンツ" : "雑誌個別情報",
            storageMode: currentUser.role !== "super_admin" && isPublishedSource ? "application_request" : "published_row",
            ...undoMeta
        })},
  ${currentUser.role !== "super_admin" && isPublishedSource && beforeRequestIssue
            ? sqlJson(buildIssueApplicationMetadata(beforeRequestIssue))
            : beforeRawSnapshot ? `${sqlString(beforeRawSnapshot)}::jsonb` : "'{}'::jsonb"},
  ${currentUser.role !== "super_admin" && isPublishedSource && responseIssue
            ? sqlJson(buildIssueApplicationMetadata(responseIssue))
            : afterRawSnapshot ? `${sqlString(afterRawSnapshot)}::jsonb` : "'{}'::jsonb"},
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

        return NextResponse.json({
            issue: responseIssue
        });
    } catch (error) {
        return createRouteErrorResponse(error, "failed to update magazine issue", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const currentUser = await getCurrentUserContext(request);
        const body = await request.json() as DeleteBody;
        const issueId = normalizeIssueId(body.issueId);
        if (!issueId) {
            return NextResponse.json({
                error: "invalid issueId"
            }, {
                status: 400
            });
        }

        const beforeRow = await loadIssueDeleteTarget(issueId);
        if (!beforeRow || (currentUser.role === "super_admin" ? beforeRow.record_status !== "published" : beforeRow.record_status === "deleted")) {
            return NextResponse.json({
                error: "magazine issue not found"
            }, {
                status: 404
            });
        }
        if (currentUser.role !== "super_admin") {
            await ensureEditableIssueRequestStatus(currentUser.id, issueId);
        }

        const debugDelayMs = normalizeDebugDelayMs(body.debugDelayMs);
        if (debugDelayMs > 0) await sleep(debugDelayMs);

        const issueKey = beforeRow.id ?? "";
        const linkedStories = issueKey ? await loadIssueLinkedStories(issueId, issueKey) : [];
        const deletedStoryIds: string[] = [];
        const updatedStoryIds: string[] = [];

        if (currentUser.role === "super_admin") {
            for (const story of linkedStories) {
                const sourceOccurrences = parseJson<Array<Record<string, unknown>>>(story.source_occurrences, []).filter((occurrence)=>String(occurrence.magazine_issue_id ?? "").trim() !== issueId);
                if (sourceOccurrences.length === 0) {
                    await queryRows(`
update public.stories
set
  status = 'deleted',
  record_status = 'deleted',
  deleted_at = now(),
  delete_reason = 'magazine_issue_delete'
where story_id = ${sqlString(story.story_id ?? "")}
  and record_status = 'published'
returning story_id;
`);
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
  ${sqlString(story.story_id ?? "")},
  ${sqlString(story.title ?? "")},
  ${sqlJson({
                    issueId,
                    story
                })},
  ${sqlJson({
                    status: "deleted",
                    record_status: "deleted"
                })},
  'super_admin',
  'cascade_from_magazine_issue_delete'
);
`);
                    deletedStoryIds.push(story.story_id ?? "");
                    continue;
                }

                const nextIssueId = String(sourceOccurrences[0]?.magazine_issue_id ?? "").trim();
                let nextIssueKey = "";
                if (nextIssueId) {
                    const nextIssueRows = await queryRows(`
select id
from public.magazine_issues
where magazine_issue_id = ${sqlString(nextIssueId)}
  and record_status <> 'deleted'
limit 1;
`);
                    nextIssueKey = nextIssueRows[0]?.id ?? "";
                }

                await queryRows(`
update public.stories
set
  first_magazine_issue_id = ${sqlNullableText(nextIssueId || null)},
  first_magazine_issue_key = ${sqlNullableText(nextIssueKey || null)},
  source_occurrences = ${sqlJson(sourceOccurrences)}
where story_id = ${sqlString(story.story_id ?? "")}
  and record_status = 'published'
returning story_id;
`);
                updatedStoryIds.push(story.story_id ?? "");
            }

            await queryRows(`
update public.magazine_issues
set
  record_status = 'deleted',
  updated_by = ${sqlAuthUserRef(currentUser.id)},
  approved_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_by = ${sqlAuthUserRef(currentUser.id)},
  deleted_at = now(),
  delete_reason = 'realtime_delete'
where magazine_issue_id = ${sqlString(issueId)}
  and record_status = 'published'
returning magazine_issue_id;
`);
        } else {
            await upsertIssueSetDraftRequest({
                currentUser,
                issue: rowToIssue(beforeRow),
                requestedAction: "delete"
            });
        }

        const contentCount = parseJson<Array<Record<string, unknown>>>(beforeRow.contents_json, []).length;
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
  'magazine_issues',
  ${sqlString(issueId)},
  ${sqlString(beforeRow.issue_label ?? "")},
  ${sqlJson({
            row: beforeRow
        })},
  ${sqlJson({
            record_status: currentUser.role === "super_admin" ? "deleted" : "delete_requested",
            deletedStoryIds,
            updatedStoryIds,
            contentCount
        })},
  ${sqlString(currentUser.role)},
  ${sqlString(currentUser.role === "super_admin" ? "realtime_delete" : "editor_delete_request")}
);
`);

        return NextResponse.json({
            deletedIssueId: issueId,
            deletedStoryIds,
            deletedStoryCount: deletedStoryIds.length,
            updatedStoryCount: updatedStoryIds.length,
            deletedContentCount: contentCount
        });
    } catch (error) {
        return createRouteErrorResponse(error, "failed to delete magazine issue", {
            databaseMessage: "データベースに接続できません。"
        });
    }
}
