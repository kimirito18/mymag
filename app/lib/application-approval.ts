import { createInternalId } from "@/app/lib/server-id";
import { queryRows } from "@/app/lib/server-postgres";
import type { CurrentUserContext } from "@/app/lib/server-current-user";
import type { ApplicationRequestAction, ApplicationRequestEntityType } from "@/app/lib/application-requests";
import { normalizeStoryReadingCore } from "@/app/lib/story-reading-similarity";

export type ApprovalRequestRow = {
  requestId: string;
  entityType: ApplicationRequestEntityType;
  entityId: string;
  title: string;
  parentLabel: string;
  action: ApplicationRequestAction;
  status: string;
  routePath: string;
  metadataJson: string | null;
  applicationGroupId: string;
  messageThreadId: string;
  requestedByUserId: string;
  requesterLoginName: string;
  requesterDisplayName: string;
  submittedAt: string;
  reviewedAt: string;
  reviewerNote: string;
};

type ParsedRequestMetadata = {
  dependencyGroupId: string;
  dependencyGroupLabel: string;
  dependsOnRequestIds: string[];
};

type PublisherReference = {
  publisher_id: string;
  publisher_key: string;
  name: string;
  reading: string;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;
const sqlTextArray = (values: string[]) => `array[${values.map(sqlString).join(", ")}]::text[]`;
const sqlNullableDate = (value: string | null) => value == null ? "null" : `${sqlString(value)}::date`;
const sqlNullableTimestamp = (value: string | null) => value == null ? "null" : `${sqlString(value)}::timestamptz`;
const sqlAuthUserRef = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "null";
  return `${sqlString(normalized)}::uuid`;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const parseJsonObject = (value: string | null | undefined): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const parseJsonValue = (value: string | null | undefined): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const parseRequestMetadata = (value: string | null | undefined): ParsedRequestMetadata => {
  const metadata = parseJsonObject(value);
  return {
    dependencyGroupId: normalizeText(metadata.dependencyGroupId),
    dependencyGroupLabel: normalizeText(metadata.dependencyGroupLabel),
    dependsOnRequestIds: Array.isArray(metadata.dependsOnRequestIds)
      ? metadata.dependsOnRequestIds.map((item) => normalizeText(item)).filter(Boolean)
      : [],
  };
};

const parseStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
};

const parseObjectArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[]
  : [];

const pairAuthorAliasIds = (authorId: string, aliasId: string) => {
  if (authorId === aliasId) {
    throw new Error("自分自身は別名義に追加できません。");
  }
  return authorId < aliasId ? [authorId, aliasId] : [aliasId, authorId];
};

const syncApprovedAuthorAliases = async (authorId: string, aliases: unknown) => {
  const aliasRows = parseObjectArray(aliases)
    .map((row) => ({
      author_id: normalizeText(row.author_id ?? row.id),
    }))
    .filter((row) => row.author_id);

  if (aliasRows.length === 0) {
    await queryRows(`
delete from public.author_alias_links
where author_id_1 = ${sqlString(authorId)}
   or author_id_2 = ${sqlString(authorId)};
`);
    return;
  }

  const aliasIds = Array.from(new Set(aliasRows.map((row) => row.author_id)));
  const rows = await queryRows(`
select
  id,
  author_id
from public.authors
where record_status <> 'deleted'
  and author_id in (${[authorId, ...aliasIds].map(sqlString).join(", ")});
`);
  const authorKeyById = new Map(rows.map((row) => [row.author_id ?? "", row.id ?? ""]));
  const authorKey = authorKeyById.get(authorId) ?? "";
  if (!authorKey) {
    throw new Error(`著者内部キーを取得できませんでした: ${authorId}`);
  }

  const missingIds = aliasIds.filter((aliasId) => !authorKeyById.has(aliasId));
  if (missingIds.length > 0) {
    throw new Error(`別名義に存在しない著者IDがあります: ${missingIds.join(", ")}`);
  }

  const pairs = Array.from(new Set(aliasIds.map((aliasId) => {
    const [leftId, rightId] = pairAuthorAliasIds(authorId, aliasId);
    const aliasKey = authorKeyById.get(aliasId) ?? "";
    const [leftKey, rightKey] = authorKey < aliasKey
      ? [authorKey, aliasKey]
      : [aliasKey, authorKey];
    return JSON.stringify({ leftId, rightId, leftKey, rightKey });
  }))).map((pair) => JSON.parse(pair) as {
    leftId: string;
    rightId: string;
    leftKey: string;
    rightKey: string;
  });

  await queryRows(`
delete from public.author_alias_links
where author_id_1 = ${sqlString(authorId)}
   or author_id_2 = ${sqlString(authorId)};
`);

  if (pairs.length === 0) return;

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

const normalizeDateLiteral = (value: unknown) => {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const buildAuthorSearchText = (name: string, reading: string) => [name, reading, name]
  .filter(Boolean)
  .join(" ")
  .slice(0, 1000);

const buildPublisherSearchText = (name: string, reading: string) => [name, reading, name]
  .filter(Boolean)
  .join(" ")
  .slice(0, 1000);

const buildMagazineSearchFields = (input: {
  magazineId?: string;
  title?: string;
  reading?: string;
  publisherNames?: string[];
  titleVariants?: Array<{ title?: unknown; reading?: unknown }>;
}) => {
  const variants = input.titleVariants ?? [];
  const variantTitles = variants.map((variant) => normalizeText(variant.title)).filter(Boolean);
  const variantReadings = variants.map((variant) => normalizeText(variant.reading)).filter(Boolean);
  const publisherNames = input.publisherNames ?? [];
  return {
    searchText: [
      input.magazineId ?? "",
      input.title ?? "",
      input.reading ?? "",
      ...publisherNames,
      ...variantTitles,
      ...variantReadings,
    ].map((value) => normalizeText(value)).filter(Boolean).join(" "),
    searchReading: [
      input.reading ?? "",
      ...variantReadings,
    ].map((value) => normalizeText(value)).filter(Boolean).join(" "),
  };
};

const buildIssueSearchText = (row: Record<string, unknown>) => [
  row.magazine_issue_id,
  row.magazine_id,
  row.issue_title,
  row.issue_title_reading,
  row.magazine_title,
  row.publisher_name,
  row.publication_frequency,
].map((value) => normalizeText(value)).filter(Boolean).join(" ").slice(0, 1000);

const buildIssueSearchReading = (row: Record<string, unknown>) => [
  row.issue_title_reading,
].map((value) => normalizeText(value)).filter(Boolean).join(" ").slice(0, 1000);

const getIssuePublicationFrequency = (metadata: Record<string, unknown>, fallback: string) => {
  const direct = normalizeText(metadata.publicationFrequency);
  if (direct) return direct;
  const frequencies = parseStringArray(metadata.publicationFrequencyList);
  if (frequencies.length > 0) return frequencies[0] ?? "";
  return fallback;
};

type ApprovedStoryPayload = {
  storyId: string;
  position: number;
  title: string;
  titleReading: string;
  authors: string;
  storyType: string;
  pageCount: string;
  seriesTitle: string;
  seriesReading: string;
  subtitle: string;
  subtitleReading: string;
  episodeNumber: string;
  episodeLabel: string;
  colorInfo: string;
  memo: string;
  tags: string[];
};

const normalizeApprovedStoryRows = (value: unknown): ApprovedStoryPayload[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const positionValue = Number(row.position ?? index + 1);
    return {
      storyId: normalizeText(row.storyId),
      position: Number.isFinite(positionValue) && positionValue > 0 ? positionValue : index + 1,
      title: normalizeText(row.title),
      titleReading: normalizeText(row.titleReading) || "みていぎ",
      authors: typeof row.authors === "string" ? row.authors : JSON.stringify(row.authors ?? []),
      storyType: normalizeText(row.storyType) || "不明",
      pageCount: normalizeText(row.pageCount),
      seriesTitle: normalizeText(row.seriesTitle),
      seriesReading: normalizeText(row.seriesReading),
      subtitle: normalizeText(row.subtitle),
      subtitleReading: normalizeText(row.subtitleReading),
      episodeNumber: normalizeText(row.episodeNumber),
      episodeLabel: normalizeText(row.episodeLabel),
      colorInfo: normalizeText(row.colorInfo),
      memo: normalizeText(row.memo),
      tags: Array.isArray(row.tags) ? row.tags.map((tag) => normalizeText(tag)).filter(Boolean) : [],
    };
  }).filter((row) => row.storyId || row.title);
};

const parseStoryContributors = (value: string) => {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed)
    ? parsed.filter((item) => item && typeof item === "object")
    : [];
};

const storyTypeValueMap: Record<string, string> = {
  "連載": "serial",
  "読み切り": "one_shot",
  "特別編": "extra",
  "外伝": "side_story",
  "不明": "unknown",
  serial: "serial",
  one_shot: "one_shot",
  extra: "extra",
  side_story: "side_story",
  unknown: "unknown",
};

const buildStorySearchText = (story: ApprovedStoryPayload, contributors: Record<string, unknown>[]) => [
  story.storyId,
  story.title,
  story.titleReading,
  story.seriesTitle,
  story.seriesReading,
  story.episodeLabel,
  story.subtitle,
  story.subtitleReading,
  ...contributors.flatMap((contributor) => [
    normalizeText(contributor.role),
    normalizeText(contributor.name),
    normalizeText(contributor.author_id ?? contributor.id),
  ]),
].filter(Boolean).join(" ").slice(0, 1000);

const buildStorySearchReading = (story: ApprovedStoryPayload) => [
  story.titleReading,
  story.seriesReading,
  story.subtitleReading,
].filter(Boolean).join(" ").slice(0, 1000);

const resolvePublisherFromMetadata = async (
  metadata: Record<string, unknown>,
  fallback?: { publisherId?: string; publisherKey?: string },
): Promise<PublisherReference> => {
  const publishers = parseObjectArray(metadata.publishers);
  const first = publishers[0] ?? {};
  const publisherId = normalizeText(first.publisher_id ?? first.publisherId ?? fallback?.publisherId);
  const publisherKey = normalizeText(first.publisher_key ?? first.publisherKey ?? fallback?.publisherKey);
  const publisherName = normalizeText(first.name ?? first.publisher_name ?? first.publisherName);

  const conditions = [
    publisherKey ? `p.id = ${sqlString(publisherKey)}` : "",
    publisherId ? `p.publisher_id = ${sqlString(publisherId)}` : "",
    publisherName ? `p.publisher_name = ${sqlString(publisherName)}` : "",
  ].filter(Boolean);

  if (conditions.length === 0) {
    throw new Error("出版社情報が不足しているため、雑誌マスターを正式反映できません。");
  }

  const rows = await queryRows(`
select
  p.publisher_id,
  p.id as publisher_key,
  p.publisher_name,
  p.publisher_reading
from public.publishers p
where p.record_status <> 'deleted'
  and (${conditions.join(" or ")})
order by
  case when p.record_status = 'published' then 0 else 1 end,
  p.updated_at desc
limit 1;
`);
  const row = rows[0];
  if (!row?.publisher_id || !row?.publisher_key) {
    throw new Error("参照先の出版社が存在しないため、雑誌マスターを正式反映できません。");
  }
  return {
    publisher_id: row.publisher_id,
    publisher_key: row.publisher_key,
    name: row.publisher_name ?? publisherName,
    reading: row.publisher_reading ?? "",
  };
};

const loadMagazineBaseRow = async (magazineId: string) => {
  const rows = await queryRows(`
select
  mt.id,
  mt.magazine_id,
  mt.title,
  mt.title_reading,
  mt.publisher_id,
  mt.publisher_key,
  coalesce(mt.publication_frequency::text, '[]') as publication_frequency_json,
  coalesce(p.publisher_name, '') as publisher_name,
  coalesce(p.publisher_reading, '') as publisher_reading
from public.magazine_titles mt
left join public.publishers p
  on p.id = mt.publisher_key
where mt.magazine_id = ${sqlString(magazineId)}
  and mt.record_status <> 'deleted'
limit 1;
`);
  return rows[0] ?? null;
};

const loadRowJson = async (table: string, idColumn: string, id: string) => {
  const rows = await queryRows(`
select row_to_json(target)::text as row_json
from (
  select *
  from public.${table}
  where ${idColumn} = ${sqlString(id)}
  limit 1
) target;
`);
  return parseJsonObject(rows[0]?.row_json);
};

const insertAuditLog = async ({
  approver,
  requestRow,
  targetTable,
  beforeData,
  afterData,
  note,
}: {
  approver: CurrentUserContext;
  requestRow: ApprovalRequestRow;
  targetTable: string;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
  note: string;
}) => {
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
  ${sqlString(`approve_${requestRow.action}`)},
  ${sqlString(targetTable)},
  ${sqlString(requestRow.entityId)},
  ${sqlString(requestRow.title)},
  ${sqlJson(beforeData)},
  ${sqlJson(afterData)},
  ${sqlString(approver.role)},
  ${sqlString(note)}
);
`);
};

const sortApprovalRows = (rows: ApprovalRequestRow[]) => {
  const remaining = new Map(rows.map((row) => [row.requestId, row]));
  const sorted: ApprovalRequestRow[] = [];
  const priorityMap: Record<ApplicationRequestEntityType, number> = {
    author: 10,
    publisher: 20,
    magazine_title: 30,
    magazine_issue_set: 40,
  };

  while (remaining.size > 0) {
    const available = Array.from(remaining.values())
      .filter((row) => {
        const metadata = parseRequestMetadata(row.metadataJson);
        return metadata.dependsOnRequestIds.every((dependencyId) => !remaining.has(dependencyId));
      })
      .sort((left, right) => {
        const leftPriority = priorityMap[left.entityType] ?? 999;
        const rightPriority = priorityMap[right.entityType] ?? 999;
        return leftPriority - rightPriority || left.requestId.localeCompare(right.requestId);
      });

    const next = available[0];
    if (!next) {
      throw new Error("申請データの依存関係を解決できませんでした。");
    }
    sorted.push(next);
    remaining.delete(next.requestId);
  }

  return sorted;
};

const approveAuthorRequest = async (requestRow: ApprovalRequestRow, approver: CurrentUserContext) => {
  const metadata = parseJsonObject(requestRow.metadataJson);
  const beforeData = await loadRowJson("authors", "author_id", requestRow.entityId);

  if (requestRow.action === "delete") {
    if (Object.keys(beforeData).length === 0) {
      throw new Error(`削除対象の著者 ${requestRow.entityId} が見つかりません。`);
    }
    await queryRows(`
update public.authors
set
  record_status = 'deleted',
  approved_by = ${sqlAuthUserRef(approver.id)},
  deleted_by = ${sqlAuthUserRef(approver.id)},
  deleted_at = now(),
  approved_at = now()
where author_id = ${sqlString(requestRow.entityId)};
`);
    const afterData = await loadRowJson("authors", "author_id", requestRow.entityId);
    await insertAuditLog({
      approver,
      requestRow,
      targetTable: "authors",
      beforeData,
      afterData,
      note: `application_request:${requestRow.requestId}`,
    });
    return;
  }

  const name = normalizeText(metadata.name ?? requestRow.title);
  const reading = normalizeText(metadata.reading);
  if (!name || !reading) {
    throw new Error(`著者 ${requestRow.title} の必須項目が不足しているため、正式反映できません。`);
  }

  if (Object.keys(beforeData).length === 0) {
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
  submitted_by,
  approved_by,
  submitted_at,
  approved_at
) values (
  ${sqlString(createInternalId("au"))},
  ${sqlString(requestRow.entityId)},
  ${sqlString(name)},
  ${sqlString(reading)},
  ${sqlJson(parseObjectArray(metadata.socialLinks))},
  ${sqlString(normalizeText(metadata.memo))},
  ${sqlTextArray(parseStringArray(metadata.tags))},
  ${sqlString(buildAuthorSearchText(name, reading))},
  'published',
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  now()
);
`);
  } else {
    const nextMemo = hasOwn(metadata, "memo") ? normalizeText(metadata.memo) : normalizeText(beforeData.memo);
    const nextTags = hasOwn(metadata, "tags") ? parseStringArray(metadata.tags) : parseStringArray(beforeData.tags);
    const nextLinks = hasOwn(metadata, "socialLinks") ? parseObjectArray(metadata.socialLinks) : parseObjectArray(beforeData.social_links);
    await queryRows(`
update public.authors
set
  author_name = ${sqlString(name)},
  author_reading = ${sqlString(reading)},
  social_links = ${sqlJson(nextLinks)},
  memo = ${sqlString(nextMemo)},
  tags = ${sqlTextArray(nextTags)},
  search_text = ${sqlString(buildAuthorSearchText(name, reading))},
  record_status = 'published',
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(requestRow.requestedByUserId)}),
  updated_by = ${sqlAuthUserRef(approver.id)},
  submitted_by = ${sqlAuthUserRef(requestRow.requestedByUserId)},
  approved_by = ${sqlAuthUserRef(approver.id)},
  submitted_at = ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  approved_at = now(),
  deleted_at = null,
  delete_reason = null
where author_id = ${sqlString(requestRow.entityId)};
`);
  }

  if (hasOwn(metadata, "otherAuthorIds")) {
    await syncApprovedAuthorAliases(requestRow.entityId, metadata.otherAuthorIds);
  }

  const afterData = await loadRowJson("authors", "author_id", requestRow.entityId);
  await insertAuditLog({
    approver,
    requestRow,
    targetTable: "authors",
    beforeData,
    afterData,
    note: `application_request:${requestRow.requestId}`,
  });
};

const approvePublisherRequest = async (requestRow: ApprovalRequestRow, approver: CurrentUserContext) => {
  const metadata = parseJsonObject(requestRow.metadataJson);
  const beforeData = await loadRowJson("publishers", "publisher_id", requestRow.entityId);

  if (requestRow.action === "delete") {
    if (Object.keys(beforeData).length === 0) {
      throw new Error(`削除対象の出版社 ${requestRow.entityId} が見つかりません。`);
    }
    await queryRows(`
update public.publishers
set
  record_status = 'deleted',
  approved_by = ${sqlAuthUserRef(approver.id)},
  deleted_by = ${sqlAuthUserRef(approver.id)},
  deleted_at = now(),
  approved_at = now()
where publisher_id = ${sqlString(requestRow.entityId)};
`);
    const afterData = await loadRowJson("publishers", "publisher_id", requestRow.entityId);
    await insertAuditLog({
      approver,
      requestRow,
      targetTable: "publishers",
      beforeData,
      afterData,
      note: `application_request:${requestRow.requestId}`,
    });
    return;
  }

  const name = normalizeText(metadata.name ?? requestRow.title);
  const reading = normalizeText(metadata.reading);
  if (!name || !reading) {
    throw new Error(`出版社 ${requestRow.title} の必須項目が不足しているため、正式反映できません。`);
  }

  const nextRelatedLink = hasOwn(metadata, "relatedLink") ? parseObjectArray(metadata.relatedLink) : parseObjectArray(beforeData.related_link);
  const nextRelatedPublishers = hasOwn(metadata, "relatedPublishers") ? parseObjectArray(metadata.relatedPublishers) : parseObjectArray(beforeData.related_publishers);
  const nextTags = hasOwn(metadata, "tags") ? parseStringArray(metadata.tags) : parseStringArray(beforeData.tags);
  const startDate = hasOwn(metadata, "startDate") ? normalizeDateLiteral(metadata.startDate) : normalizeDateLiteral(beforeData.start_date);
  const endDate = hasOwn(metadata, "endDate") ? normalizeDateLiteral(metadata.endDate) : normalizeDateLiteral(beforeData.end_date);
  const memo = hasOwn(metadata, "memo") ? normalizeText(metadata.memo) : normalizeText(beforeData.memo);
  const address = hasOwn(metadata, "address") ? normalizeText(metadata.address) : normalizeText(beforeData.address);
  const url = hasOwn(metadata, "url") ? normalizeText(metadata.url) : normalizeText(beforeData.url);

  if (Object.keys(beforeData).length === 0) {
    await queryRows(`
insert into public.publishers (
  id,
  publisher_id,
  publisher_name,
  publisher_reading,
  address,
  url,
  related_link,
  start_date,
  end_date,
  memo,
  related_publishers,
  tags,
  search_text,
  record_status,
  owner_user_id,
  created_by,
  updated_by,
  submitted_by,
  approved_by,
  submitted_at,
  approved_at
) values (
  ${sqlString(createInternalId("pu"))},
  ${sqlString(requestRow.entityId)},
  ${sqlString(name)},
  ${sqlString(reading)},
  ${sqlString(address)},
  ${sqlString(url)},
  ${sqlJson(nextRelatedLink)},
  ${sqlNullableDate(startDate)},
  ${sqlNullableDate(endDate)},
  ${sqlString(memo)},
  ${sqlJson(nextRelatedPublishers)},
  ${sqlTextArray(nextTags)},
  ${sqlString(buildPublisherSearchText(name, reading))},
  'published',
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  now()
);
`);
  } else {
    await queryRows(`
update public.publishers
set
  publisher_name = ${sqlString(name)},
  publisher_reading = ${sqlString(reading)},
  address = ${sqlString(address)},
  url = ${sqlString(url)},
  related_link = ${sqlJson(nextRelatedLink)},
  start_date = ${sqlNullableDate(startDate)},
  end_date = ${sqlNullableDate(endDate)},
  memo = ${sqlString(memo)},
  related_publishers = ${sqlJson(nextRelatedPublishers)},
  tags = ${sqlTextArray(nextTags)},
  search_text = ${sqlString(buildPublisherSearchText(name, reading))},
  record_status = 'published',
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(requestRow.requestedByUserId)}),
  updated_by = ${sqlAuthUserRef(approver.id)},
  submitted_by = ${sqlAuthUserRef(requestRow.requestedByUserId)},
  approved_by = ${sqlAuthUserRef(approver.id)},
  submitted_at = ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  approved_at = now(),
  deleted_at = null,
  delete_reason = null
where publisher_id = ${sqlString(requestRow.entityId)};
`);
  }

  const afterData = await loadRowJson("publishers", "publisher_id", requestRow.entityId);
  await insertAuditLog({
    approver,
    requestRow,
    targetTable: "publishers",
    beforeData,
    afterData,
    note: `application_request:${requestRow.requestId}`,
  });
};

const approveMagazineTitleRequest = async (requestRow: ApprovalRequestRow, approver: CurrentUserContext) => {
  const metadata = parseJsonObject(requestRow.metadataJson);
  const beforeData = await loadRowJson("magazine_titles", "magazine_id", requestRow.entityId);

  if (requestRow.action === "delete") {
    if (Object.keys(beforeData).length === 0) {
      throw new Error(`削除対象の雑誌マスター ${requestRow.entityId} が見つかりません。`);
    }
    await queryRows(`
update public.magazine_titles
set
  record_status = 'deleted',
  approved_by = ${sqlAuthUserRef(approver.id)},
  deleted_by = ${sqlAuthUserRef(approver.id)},
  deleted_at = now(),
  approved_at = now()
where magazine_id = ${sqlString(requestRow.entityId)};
`);
    await queryRows(`
update public.magazine_issues
set
  record_status = 'deleted',
  approved_by = ${sqlAuthUserRef(approver.id)},
  deleted_by = ${sqlAuthUserRef(approver.id)},
  deleted_at = now(),
  approved_at = now()
where magazine_id = ${sqlString(requestRow.entityId)}
  and record_status <> 'deleted';
`);
    const afterData = await loadRowJson("magazine_titles", "magazine_id", requestRow.entityId);
    await insertAuditLog({
      approver,
      requestRow,
      targetTable: "magazine_titles",
      beforeData,
      afterData,
      note: `application_request:${requestRow.requestId}`,
    });
    return;
  }

  const name = normalizeText(metadata.name ?? requestRow.title);
  const reading = normalizeText(metadata.reading);
  if (!name || !reading) {
    throw new Error(`雑誌マスター ${requestRow.title} の必須項目が不足しているため、正式反映できません。`);
  }

  const fallbackPublisher = {
    publisherId: normalizeText(beforeData.publisher_id),
    publisherKey: normalizeText(beforeData.publisher_key),
  };
  const primaryPublisher = await resolvePublisherFromMetadata(metadata, fallbackPublisher);
  const resolvedPublishers = parseObjectArray(metadata.publishers).length > 0
    ? parseObjectArray(metadata.publishers).map((row) => ({
        role: normalizeText(row.role ?? row.relation),
        name: normalizeText(row.name ?? row.publisher_name ?? primaryPublisher.name),
        reading: normalizeText(row.reading ?? ""),
        publisher_key: normalizeText(row.publisher_key ?? row.publisherKey ?? primaryPublisher.publisher_key),
        publisher_id: normalizeText(row.publisher_id ?? row.publisherId ?? primaryPublisher.publisher_id),
      }))
    : [{
        role: "発行",
        name: primaryPublisher.name,
        reading: primaryPublisher.reading,
        publisher_key: primaryPublisher.publisher_key,
        publisher_id: primaryPublisher.publisher_id,
      }];

  const titleVariants = hasOwn(metadata, "titleVariants") ? parseObjectArray(metadata.titleVariants) : parseObjectArray(beforeData.title_variants);
  const relatedMagazines = hasOwn(metadata, "relatedMagazines") ? parseObjectArray(metadata.relatedMagazines) : parseObjectArray(beforeData.related_magazines);
  const publicationFrequency = hasOwn(metadata, "publicationFrequency")
    ? parseStringArray(metadata.publicationFrequency)
    : parseStringArray(beforeData.publication_frequency);
  const tags = hasOwn(metadata, "tags") ? parseStringArray(metadata.tags) : parseStringArray(beforeData.tags);
  const note = hasOwn(metadata, "memo") ? normalizeText(metadata.memo) : normalizeText(beforeData.note);
  const relationNote = hasOwn(metadata, "relationNote") ? normalizeText(metadata.relationNote) : normalizeText(beforeData.relation_note);
  const issn = hasOwn(metadata, "issn") ? normalizeText(metadata.issn) : normalizeText(beforeData.issn);
  const jpno = hasOwn(metadata, "jpno") ? normalizeText(metadata.jpno) : normalizeText(beforeData.jpno);
  const firstPublishedDate = hasOwn(metadata, "firstPublishedDate")
    ? normalizeDateLiteral(metadata.firstPublishedDate)
    : normalizeDateLiteral(beforeData.first_published_date);
  const closedDate = hasOwn(metadata, "closedDate")
    ? normalizeDateLiteral(metadata.closedDate)
    : normalizeDateLiteral(beforeData.closed_date);
  const searchFields = buildMagazineSearchFields({
    magazineId: requestRow.entityId,
    title: name,
    reading,
    publisherNames: resolvedPublishers.map((row) => row.name).filter(Boolean),
    titleVariants,
  });

  if (Object.keys(beforeData).length === 0) {
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
  first_published_date,
  closed_date,
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
  submitted_by,
  approved_by,
  submitted_at,
  approved_at
) values (
  ${sqlString(requestRow.entityId)},
  ${sqlString(createInternalId("mt"))},
  ${sqlString(primaryPublisher.publisher_key)},
  ${sqlString(name)},
  ${sqlString(reading)},
  ${sqlJson(titleVariants)},
  ${sqlJson(resolvedPublishers)},
  ${sqlString(primaryPublisher.publisher_id)},
  ${firstPublishedDate ? sqlNullableDate(firstPublishedDate) : "default"},
  ${closedDate ? sqlNullableDate(closedDate) : "default"},
  ${sqlJson(publicationFrequency)},
  ${sqlString(issn)},
  ${sqlString(jpno)},
  ${sqlString(note)},
  ${sqlJson(relatedMagazines)},
  ${sqlString(relationNote)},
  ${sqlTextArray(tags)},
  ${sqlString(searchFields.searchText)},
  ${sqlString(searchFields.searchReading)},
  'published',
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  now()
);
`);
  } else {
    await queryRows(`
update public.magazine_titles
set
  publisher_key = ${sqlString(primaryPublisher.publisher_key)},
  title = ${sqlString(name)},
  title_reading = ${sqlString(reading)},
  title_variants = ${sqlJson(titleVariants)},
  publishers = ${sqlJson(resolvedPublishers)},
  publisher_id = ${sqlString(primaryPublisher.publisher_id)},
  first_published_date = ${firstPublishedDate ? sqlNullableDate(firstPublishedDate) : "first_published_date"},
  closed_date = ${closedDate ? sqlNullableDate(closedDate) : "closed_date"},
  publication_frequency = ${sqlJson(publicationFrequency)},
  issn = ${sqlString(issn)},
  jpno = ${sqlString(jpno)},
  note = ${sqlString(note)},
  related_magazines = ${sqlJson(relatedMagazines)},
  relation_note = ${sqlString(relationNote)},
  tags = ${sqlTextArray(tags)},
  search_text = ${sqlString(searchFields.searchText)},
  search_reading = ${sqlString(searchFields.searchReading)},
  record_status = 'published',
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(requestRow.requestedByUserId)}),
  updated_by = ${sqlAuthUserRef(approver.id)},
  submitted_by = ${sqlAuthUserRef(requestRow.requestedByUserId)},
  approved_by = ${sqlAuthUserRef(approver.id)},
  submitted_at = ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  approved_at = now(),
  deleted_at = null,
  delete_reason = null
where magazine_id = ${sqlString(requestRow.entityId)};
`);
  }

  const afterData = await loadRowJson("magazine_titles", "magazine_id", requestRow.entityId);
  await insertAuditLog({
    approver,
    requestRow,
    targetTable: "magazine_titles",
    beforeData,
    afterData,
    note: `application_request:${requestRow.requestId}`,
  });
};

const syncApprovedIssueStories = async (
  requestRow: ApprovalRequestRow,
  approver: CurrentUserContext,
  metadata: Record<string, unknown>,
) => {
  if (!hasOwn(metadata, "stories")) {
    await queryRows(`
update public.stories
set
  record_status = 'published',
  updated_by = ${sqlAuthUserRef(approver.id)},
  submitted_by = ${sqlAuthUserRef(requestRow.requestedByUserId)},
  approved_by = ${sqlAuthUserRef(approver.id)},
  approved_at = now()
where first_magazine_issue_id = ${sqlString(requestRow.entityId)}
  and record_status in ('draft', 'submitted');
`);
    return;
  }

  const issueRows = await queryRows(`
select
  id,
  coalesce(published_date::text, '') as published_date
from public.magazine_issues
where magazine_issue_id = ${sqlString(requestRow.entityId)}
limit 1;
`);
  const issueRow = issueRows[0];
  if (!issueRow?.id) {
    throw new Error(`雑誌個別 ${requestRow.entityId} の内部キーを取得できませんでした。`);
  }

  const desiredStories = normalizeApprovedStoryRows(metadata.stories);
  const existingRows = await queryRows(`
select
  id,
  story_id
from public.stories
where first_magazine_issue_id = ${sqlString(requestRow.entityId)};
`);
  const existingByStoryId = new Map(existingRows.map((row) => [normalizeText(row.story_id), row]));
  const desiredStoryIds = new Set<string>();

  for (const story of desiredStories) {
    const storyId = story.storyId || (() => {
      throw new Error("申請中の作品IDが不足しています。");
    })();
    desiredStoryIds.add(storyId);
    const contributors = parseStoryContributors(story.authors);
    const searchText = buildStorySearchText(story, contributors);
    const searchReading = buildStorySearchReading(story);
    const episodeNumberSort = story.episodeNumber ? Number(story.episodeNumber) : null;
    const pageCount = story.pageCount ? Number(story.pageCount) : null;
    const sourceOccurrences = [
      {
        magazine_issue_id: requestRow.entityId,
        position: String(story.position),
      },
    ];
    const storyType = storyTypeValueMap[story.storyType] ?? "unknown";
    const existing = existingByStoryId.get(storyId);

    if (existing?.id) {
      await queryRows(`
update public.stories
set
  story_type = ${sqlString(storyType)},
  series_title = ${sqlString(story.seriesTitle)},
  series_title_reading = ${sqlString(story.seriesReading)},
  episode_number = ${sqlString(story.episodeLabel)},
  episode_number_sort = ${episodeNumberSort == null || Number.isNaN(episodeNumberSort) ? "null" : String(episodeNumberSort)},
  title = ${sqlString(story.title)},
  title_reading = ${sqlString(story.titleReading || "みていぎ")},
  title_reading_core = ${sqlString(normalizeStoryReadingCore(story.titleReading || "みていぎ"))},
  subtitle = ${sqlString(story.subtitle)},
  subtitle_reading = ${sqlString(story.subtitleReading)},
  contributors = ${sqlJson(contributors)},
  page_count = ${pageCount == null || Number.isNaN(pageCount) ? "null" : String(pageCount)},
  first_published_date = ${issueRow.published_date ? `${sqlString(issueRow.published_date)}::date` : "null"},
  first_magazine_issue_id = ${sqlString(requestRow.entityId)},
  first_magazine_issue_key = ${sqlString(issueRow.id)},
  status = 'active',
  color_info = ${sqlString(story.colorInfo)},
  memo = ${sqlString(story.memo)},
  tags = ${sqlTextArray(story.tags)},
  source_occurrences = ${sqlJson(sourceOccurrences)},
  search_text = ${sqlString(searchText)},
  search_reading = ${sqlString(searchReading)},
  record_status = 'published',
  updated_by = ${sqlAuthUserRef(approver.id)},
  submitted_by = ${sqlAuthUserRef(requestRow.requestedByUserId)},
  approved_by = ${sqlAuthUserRef(approver.id)},
  submitted_at = ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  approved_at = now(),
  deleted_at = null,
  delete_reason = null
where id = ${sqlString(existing.id)};
`);
      continue;
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
  submitted_by,
  approved_by,
  submitted_at,
  approved_at
) values (
  ${sqlString(createInternalId("st"))},
  ${sqlString(storyId)},
  ${sqlString(storyType)},
  ${sqlString(story.seriesTitle)},
  ${sqlString(story.seriesReading)},
  ${sqlString(story.episodeLabel)},
  ${episodeNumberSort == null || Number.isNaN(episodeNumberSort) ? "null" : String(episodeNumberSort)},
  ${sqlString(story.title)},
  ${sqlString(story.titleReading || "みていぎ")},
  ${sqlString(normalizeStoryReadingCore(story.titleReading || "みていぎ"))},
  ${sqlString(story.subtitle)},
  ${sqlString(story.subtitleReading)},
  ${sqlJson(contributors)},
  ${pageCount == null || Number.isNaN(pageCount) ? "null" : String(pageCount)},
  ${issueRow.published_date ? `${sqlString(issueRow.published_date)}::date` : "null"},
  ${sqlString(requestRow.entityId)},
  ${sqlString(issueRow.id)},
  'active',
  ${sqlString(story.colorInfo)},
  ${sqlString(story.memo)},
  ${sqlTextArray(story.tags)},
  '[]'::jsonb,
  ${sqlJson(sourceOccurrences)},
  ${sqlString(searchText)},
  ${sqlString(searchReading)},
  'published',
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  now()
);
`);
  }

  await queryRows(`
update public.stories
set
  record_status = 'deleted',
  status = 'deleted',
  approved_by = ${sqlAuthUserRef(approver.id)},
  deleted_by = ${sqlAuthUserRef(approver.id)},
  deleted_at = now(),
  approved_at = now()
where first_magazine_issue_id = ${sqlString(requestRow.entityId)}
  and ${desiredStoryIds.size > 0 ? `story_id not in (${Array.from(desiredStoryIds).map(sqlString).join(", ")})` : "true"};
`);
};

const approveMagazineIssueRequest = async (requestRow: ApprovalRequestRow, approver: CurrentUserContext) => {
  const metadata = parseJsonObject(requestRow.metadataJson);
  const beforeData = await loadRowJson("magazine_issues", "magazine_issue_id", requestRow.entityId);

  if (requestRow.action === "delete") {
    if (Object.keys(beforeData).length === 0) {
      throw new Error(`削除対象の雑誌個別 ${requestRow.entityId} が見つかりません。`);
    }
    await queryRows(`
update public.magazine_issues
set
  record_status = 'deleted',
  approved_by = ${sqlAuthUserRef(approver.id)},
  deleted_by = ${sqlAuthUserRef(approver.id)},
  deleted_at = now(),
  approved_at = now()
where magazine_issue_id = ${sqlString(requestRow.entityId)};
`);
    await queryRows(`
update public.stories
set
  record_status = 'deleted',
  status = 'deleted',
  approved_by = ${sqlAuthUserRef(approver.id)},
  deleted_by = ${sqlAuthUserRef(approver.id)},
  deleted_at = now(),
  approved_at = now()
where first_magazine_issue_id = ${sqlString(requestRow.entityId)}
  and record_status <> 'deleted';
`);
    const afterData = await loadRowJson("magazine_issues", "magazine_issue_id", requestRow.entityId);
    await insertAuditLog({
      approver,
      requestRow,
      targetTable: "magazine_issues",
      beforeData,
      afterData,
      note: `application_request:${requestRow.requestId}`,
    });
    return;
  }

  const magazineId = normalizeText(metadata.magazineId)
    || (() => {
      const match = requestRow.routePath.match(/\/magazines\/(M\d{6})\//);
      return match?.[1] ?? "";
    })();
  if (!magazineId) {
    throw new Error(`雑誌個別 ${requestRow.title} の親雑誌IDが不足しているため、正式反映できません。`);
  }

  const magazineRow = await loadMagazineBaseRow(magazineId);
  if (!magazineRow?.id || !magazineRow.publisher_id || !magazineRow.publisher_key) {
    throw new Error(`雑誌個別 ${requestRow.title} の親雑誌マスターが存在しないため、正式反映できません。`);
  }
  const resolvedMagazineId = magazineRow.magazine_id ?? magazineId;
  const resolvedMagazineKey = magazineRow.id;
  const resolvedPublisherId = magazineRow.publisher_id;
  const resolvedPublisherKey = magazineRow.publisher_key;

  const issueTitle = normalizeText(metadata.issueTitle ?? magazineRow.title ?? requestRow.title);
  const issueTitleReading = normalizeText(metadata.titleReading ?? magazineRow.title_reading ?? "みていぎ") || "みていぎ";
  const issueLabel = normalizeText(metadata.issueLabel ?? requestRow.title) || requestRow.title;
  const publisherName = normalizeText(metadata.publisherName ?? magazineRow.publisher_name);
  const publicationFrequencyJson = parseStringArray(parseJsonValue(magazineRow.publication_frequency_json));
  const searchRow = {
    magazine_issue_id: requestRow.entityId,
    magazine_id: magazineRow.magazine_id,
    issue_title: issueTitle,
    issue_title_reading: issueTitleReading,
    magazine_title: normalizeText(metadata.magazineTitle ?? magazineRow.title),
    publisher_name: publisherName,
    publication_frequency: getIssuePublicationFrequency(metadata, normalizeText(metadata.publicationFrequency ?? "")),
  };

  if (Object.keys(beforeData).length === 0) {
    const publishers = parseObjectArray(metadata.publishers).length > 0
      ? parseObjectArray(metadata.publishers)
      : [{
          role: "発行",
          name: magazineRow.publisher_name,
          reading: magazineRow.publisher_reading,
          publisher_key: resolvedPublisherKey,
          publisher_id: resolvedPublisherId,
        }];
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
  submitted_by,
  approved_by,
  submitted_at,
  approved_at
) values (
  ${sqlString(createInternalId("mi"))},
  ${sqlString(requestRow.entityId)},
  ${sqlString(requestRow.entityId)},
  ${sqlString(resolvedMagazineId)},
  ${sqlString(resolvedMagazineKey)},
  ${sqlString(resolvedPublisherId)},
  ${sqlString(resolvedPublisherKey)},
  ${sqlString(issueTitle)},
  ${sqlString(issueTitleReading)},
  ${sqlString(issueLabel)},
  ${sqlString(getIssuePublicationFrequency(metadata, publicationFrequencyJson[0] ?? ""))},
  ${sqlString(normalizeText(metadata.mediaFormat) || "print")},
  ${sqlString(publisherName)},
  ${sqlJson(publishers)},
  ${sqlString(normalizeText(metadata.subtitle))},
  ${sqlString(normalizeText(metadata.subtitleReading) || "みていぎ")},
  ${sqlString(normalizeText(metadata.volumeNumber))},
  ${sqlString(normalizeText(metadata.issueNumber))},
  ${sqlString(normalizeText(metadata.totalIssueNumber))},
  ${sqlString(normalizeText(metadata.issueNumberDisplayed))},
  ${sqlString(normalizeText(metadata.subIssueNumber))},
  ${sqlString(normalizeText(metadata.volumeIssueNote))},
  ${sqlString(normalizeText(metadata.price))},
  ${sqlString(normalizeText(metadata.size))},
  ${sqlJson(parseObjectArray(metadata.contents))},
  ${sqlString(normalizeText(metadata.memo))},
  ${String(Number(metadata.sourceWorkCount ?? 0) || 0)},
  ${sqlString(normalizeText(metadata.sourceFirstWorkId))},
  ${sqlTextArray(parseStringArray(metadata.tags))},
  ${sqlJson(parseObjectArray(metadata.relatedMagazines))},
  ${sqlString(normalizeText(metadata.binding))},
  ${sqlString(normalizeText(metadata.magazineCode))},
  ${sqlTextArray(parseStringArray(metadata.category))},
  ${sqlString(normalizeText(metadata.rating))},
  ${normalizeText(metadata.isSpecialIssue) === "true" ? "true" : "false"},
  ${normalizeText(metadata.isMitsumine) === "true" ? "true" : "false"},
  ${sqlString(buildIssueSearchText(searchRow))},
  ${sqlString(buildIssueSearchReading(searchRow))},
  'published',
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlAuthUserRef(requestRow.requestedByUserId)},
  ${sqlAuthUserRef(approver.id)},
  ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  now()
);
`);
  } else {
    await queryRows(`
update public.magazine_issues
set
  magazine_id = ${sqlString(resolvedMagazineId)},
  magazine_key = ${sqlString(resolvedMagazineKey)},
  publisher_id = ${sqlString(resolvedPublisherId)},
  publisher_key = ${sqlString(resolvedPublisherKey)},
  issue_title = ${sqlString(issueTitle)},
  issue_title_reading = ${sqlString(issueTitleReading)},
  issue_label = ${sqlString(issueLabel)},
  publication_frequency = ${sqlString(getIssuePublicationFrequency(metadata, normalizeText(beforeData.publication_frequency)))},
  media_format = ${sqlString(normalizeText(metadata.mediaFormat) || normalizeText(beforeData.media_format) || "print")},
  publisher_name = ${sqlString(publisherName)},
  subtitle = ${sqlString(hasOwn(metadata, "subtitle") ? normalizeText(metadata.subtitle) : normalizeText(beforeData.subtitle))},
  subtitle_reading = ${sqlString(hasOwn(metadata, "subtitleReading") ? normalizeText(metadata.subtitleReading) || "みていぎ" : normalizeText(beforeData.subtitle_reading) || "みていぎ")},
  volume_number = ${sqlString(hasOwn(metadata, "volumeNumber") ? normalizeText(metadata.volumeNumber) : normalizeText(beforeData.volume_number))},
  issue_number = ${sqlString(hasOwn(metadata, "issueNumber") ? normalizeText(metadata.issueNumber) : normalizeText(beforeData.issue_number))},
  total_issue_number = ${sqlString(hasOwn(metadata, "totalIssueNumber") ? normalizeText(metadata.totalIssueNumber) : normalizeText(beforeData.total_issue_number))},
  issue_number_displayed = ${sqlString(hasOwn(metadata, "issueNumberDisplayed") ? normalizeText(metadata.issueNumberDisplayed) : normalizeText(beforeData.issue_number_displayed))},
  sub_issue_number = ${sqlString(hasOwn(metadata, "subIssueNumber") ? normalizeText(metadata.subIssueNumber) : normalizeText(beforeData.sub_issue_number))},
  volume_issue_note = ${sqlString(hasOwn(metadata, "volumeIssueNote") ? normalizeText(metadata.volumeIssueNote) : normalizeText(beforeData.volume_issue_note))},
  price = ${sqlString(hasOwn(metadata, "price") ? normalizeText(metadata.price) : normalizeText(beforeData.price))},
  size = ${sqlString(hasOwn(metadata, "size") ? normalizeText(metadata.size) : normalizeText(beforeData.size))},
  contents = ${sqlJson(hasOwn(metadata, "contents") ? parseObjectArray(metadata.contents) : parseObjectArray(beforeData.contents))},
  note = ${sqlString(hasOwn(metadata, "memo") ? normalizeText(metadata.memo) : normalizeText(beforeData.note))},
  source_work_count = ${String(Number(hasOwn(metadata, "sourceWorkCount") ? metadata.sourceWorkCount : beforeData.source_work_count ?? 0) || 0)},
  source_first_work_id = ${sqlString(hasOwn(metadata, "sourceFirstWorkId") ? normalizeText(metadata.sourceFirstWorkId) : normalizeText(beforeData.source_first_work_id))},
  tags = ${sqlTextArray(hasOwn(metadata, "tags") ? parseStringArray(metadata.tags) : parseStringArray(beforeData.tags))},
  related_magazines = ${sqlJson(hasOwn(metadata, "relatedMagazines") ? parseObjectArray(metadata.relatedMagazines) : parseObjectArray(beforeData.related_magazines))},
  binding = ${sqlString(hasOwn(metadata, "binding") ? normalizeText(metadata.binding) : normalizeText(beforeData.binding))},
  magazine_code = ${sqlString(hasOwn(metadata, "magazineCode") ? normalizeText(metadata.magazineCode) : normalizeText(beforeData.magazine_code))},
  category = ${sqlTextArray(hasOwn(metadata, "category") ? parseStringArray(metadata.category) : parseStringArray(beforeData.category))},
  rating = ${sqlString(hasOwn(metadata, "rating") ? normalizeText(metadata.rating) : normalizeText(beforeData.rating))},
  is_special_issue = ${hasOwn(metadata, "isSpecialIssue") ? (normalizeText(metadata.isSpecialIssue) === "true" ? "true" : "false") : (normalizeText(beforeData.is_special_issue) === "true" ? "true" : "false")},
  is_mitsumine = ${hasOwn(metadata, "isMitsumine") ? (normalizeText(metadata.isMitsumine) === "true" ? "true" : "false") : (normalizeText(beforeData.is_mitsumine) === "true" ? "true" : "false")},
  search_text = ${sqlString(buildIssueSearchText(searchRow))},
  search_reading = ${sqlString(buildIssueSearchReading(searchRow))},
  record_status = 'published',
  owner_user_id = coalesce(owner_user_id, ${sqlAuthUserRef(requestRow.requestedByUserId)}),
  updated_by = ${sqlAuthUserRef(approver.id)},
  submitted_by = ${sqlAuthUserRef(requestRow.requestedByUserId)},
  approved_by = ${sqlAuthUserRef(approver.id)},
  submitted_at = ${sqlNullableTimestamp(requestRow.submittedAt || null)},
  approved_at = now(),
  deleted_at = null,
  delete_reason = null
where magazine_issue_id = ${sqlString(requestRow.entityId)};
`);
  }

  await syncApprovedIssueStories(requestRow, approver, metadata);

  const afterData = await loadRowJson("magazine_issues", "magazine_issue_id", requestRow.entityId);
  await insertAuditLog({
    approver,
    requestRow,
    targetTable: "magazine_issues",
    beforeData,
    afterData,
    note: `application_request:${requestRow.requestId}`,
  });
};

const applyApprovedRequest = async (requestRow: ApprovalRequestRow, approver: CurrentUserContext) => {
  if (requestRow.entityType === "author") {
    await approveAuthorRequest(requestRow, approver);
    return;
  }
  if (requestRow.entityType === "publisher") {
    await approvePublisherRequest(requestRow, approver);
    return;
  }
  if (requestRow.entityType === "magazine_title") {
    await approveMagazineTitleRequest(requestRow, approver);
    return;
  }
  await approveMagazineIssueRequest(requestRow, approver);
};

export const applyApprovedApplicationRows = async (rows: ApprovalRequestRow[], approver: CurrentUserContext) => {
  const sortedRows = sortApprovalRows(rows);
  for (const row of sortedRows) {
    await applyApprovedRequest(row, approver);
  }
};

const buildWorkflowStatusAssignments = (nextStatus: "draft" | "submitted") => {
  if (nextStatus === "submitted") {
    return `
  record_status = 'submitted',
  submitted_by = coalesce(submitted_by, owner_user_id),
  submitted_at = now(),
  approved_by = null,
  approved_at = null`;
  }
  return `
  record_status = 'draft',
  submitted_by = null,
  submitted_at = null,
  approved_by = null,
  approved_at = null`;
};

const syncAuthorWorkflowStatus = async (requestRow: ApprovalRequestRow, nextStatus: "draft" | "submitted") => {
  await queryRows(`
update public.authors
set${buildWorkflowStatusAssignments(nextStatus)}
where author_id = ${sqlString(requestRow.entityId)}
  and record_status <> 'deleted';
`);
};

const syncPublisherWorkflowStatus = async (requestRow: ApprovalRequestRow, nextStatus: "draft" | "submitted") => {
  await queryRows(`
update public.publishers
set${buildWorkflowStatusAssignments(nextStatus)}
where publisher_id = ${sqlString(requestRow.entityId)}
  and record_status <> 'deleted';
`);
};

const syncMagazineTitleWorkflowStatus = async (requestRow: ApprovalRequestRow, nextStatus: "draft" | "submitted") => {
  await queryRows(`
update public.magazine_titles
set${buildWorkflowStatusAssignments(nextStatus)}
where magazine_id = ${sqlString(requestRow.entityId)}
  and record_status <> 'deleted';
`);
};

const syncMagazineIssueWorkflowStatus = async (requestRow: ApprovalRequestRow, nextStatus: "draft" | "submitted") => {
  await queryRows(`
update public.magazine_issues
set${buildWorkflowStatusAssignments(nextStatus)}
where magazine_issue_id = ${sqlString(requestRow.entityId)}
  and record_status <> 'deleted';
`);
  await queryRows(`
update public.stories
set${buildWorkflowStatusAssignments(nextStatus)}
where first_magazine_issue_id = ${sqlString(requestRow.entityId)}
  and record_status <> 'deleted';
`);
};

export const syncApplicationRequestRowsWorkflowStatus = async (
  rows: ApprovalRequestRow[],
  nextStatus: "draft" | "submitted",
) => {
  const sortedRows = sortApprovalRows(rows);
  for (const row of sortedRows) {
    if (row.action === "delete") continue;
    if (row.entityType === "author") {
      await syncAuthorWorkflowStatus(row, nextStatus);
      continue;
    }
    if (row.entityType === "publisher") {
      await syncPublisherWorkflowStatus(row, nextStatus);
      continue;
    }
    if (row.entityType === "magazine_title") {
      await syncMagazineTitleWorkflowStatus(row, nextStatus);
      continue;
    }
    await syncMagazineIssueWorkflowStatus(row, nextStatus);
  }
};
