import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { queryRows, withTransaction } from "@/app/lib/server-postgres";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { applicationActionLabelMap, type ApplicationBadgeSummary, type ApplicationRequestAction, type ApplicationRequestEntityType, type ApplicationRequestListItem, type ApplicationRequestStatus } from "@/app/lib/application-requests";
import { applyApprovedApplicationRows, syncApplicationRequestRowsWorkflowStatus, type ApprovalRequestRow } from "@/app/lib/application-approval";

export const runtime = "nodejs";

type ApplicationMutationBody = {
  operation?: unknown;
  requestIds?: unknown;
  reviewerNote?: unknown;
  submitterNote?: unknown;
};

type ParsedRequestMetadata = {
  dependencyGroupId: string;
  dependencyGroupLabel: string;
  dependsOnRequestIds: string[];
};

const metadataFieldLabelMap: Record<string, string> = {
  name: "名前",
  reading: "読み",
  address: "住所",
  url: "URL",
  relatedLink: "関連リンク",
  startDate: "設立日",
  endDate: "終了日",
  memo: "備考",
  relatedPublishers: "関連会社",
  socialLinks: "SNS",
  tags: "タグ",
  titleVariants: "タイトル表記ブレ",
  publishers: "出版社",
  publicationFrequency: "刊行",
  firstPublishedDate: "創刊日",
  closedDate: "終了日",
  issn: "ISSN",
  jpno: "JPNO",
  relatedMagazines: "関連誌",
  relationNote: "関連誌メモ",
  issueTitle: "雑誌個別名",
  issueLabel: "表示ラベル",
  titleReading: "読み",
  mediaFormat: "媒体",
  subtitle: "サブタイトル",
  subtitleReading: "サブタイトル読み",
  volumeNumber: "巻",
  issueNumber: "号",
  totalIssueNumber: "通巻",
  issueNumberDisplayed: "号数表示",
  subIssueNumber: "補助表記巻号",
  volumeIssueNote: "巻号メモ",
  publisherName: "出版社表示",
  price: "価格",
  size: "サイズ",
  binding: "製本",
  magazineCode: "雑誌コード",
  category: "分類",
  rating: "レイティング",
  isSpecialIssue: "増刊",
  isMitsumine: "三峰",
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeRequestIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
};

const sqlNullableText = (value: string | null) => value == null ? "null" : sqlString(value);

const parseJsonObject = (value: string | null | undefined): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const parseRequestMetadata = (value: string | null | undefined): ParsedRequestMetadata => {
  const metadata = parseJsonObject(value);
  const dependsOnRequestIds = Array.isArray(metadata.dependsOnRequestIds)
    ? metadata.dependsOnRequestIds.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  return {
    dependencyGroupId: normalizeText(metadata.dependencyGroupId),
    dependencyGroupLabel: normalizeText(metadata.dependencyGroupLabel),
    dependsOnRequestIds,
  };
};

const normalizeMetadataValue = (value: unknown) => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.length > 0 ? value : "";
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0 ? value : "";
  return normalizeText(value);
};

const buildItemSummary = (
  entityType: ApplicationRequestEntityType,
  action: ApplicationRequestAction,
  metadata: Record<string, unknown>,
) => {
  const changedFieldLabels = Object.entries(metadataFieldLabelMap)
    .filter(([key]) => key in metadata)
    .filter(([key]) => normalizeMetadataValue(metadata[key]))
    .map(([, label]) => label);

  if (entityType === "magazine_issue_set") {
    const storyCount = Math.max(0, Number(metadata.sourceWorkCount ?? 0) || 0);
    const contentCount = Math.max(
      0,
      Number(metadata.contentCount ?? (Array.isArray(metadata.contents) ? metadata.contents.length : 0)) || 0,
    );
    const summaryItems = [
      "雑誌個別情報 1件",
      `作品リスト ${storyCount}件`,
      `コンテンツ ${contentCount}件`,
    ];
    return {
      summaryItems,
      changedFieldLabels,
      policyNote: "このセットを承認すると、作品リストとコンテンツもまとめて承認します。却下も同様に一括処理します。",
    };
  }

  if (entityType === "magazine_title") {
    return {
      summaryItems: [
        action === "create" ? "雑誌マスター新規 1件" : action === "delete" ? "雑誌マスター削除 1件" : "雑誌マスター修正 1件",
      ],
      changedFieldLabels,
      policyNote: "",
    };
  }

  if (entityType === "publisher") {
    return {
      summaryItems: [
        action === "create" ? "出版社新規 1件" : action === "delete" ? "出版社削除 1件" : "出版社修正 1件",
      ],
      changedFieldLabels,
      policyNote: "",
    };
  }

  return {
    summaryItems: [
      action === "create" ? "著者新規 1件" : action === "delete" ? "著者削除 1件" : "著者修正 1件",
    ],
    changedFieldLabels,
    policyNote: "",
  };
};

const mapGroupRows = (rows: Record<string, string | null>[]) => rows.map((row) => ({
  requestId: row.request_id ?? "",
  entityType: (row.entity_type ?? "author") as ApplicationRequestEntityType,
  entityId: row.entity_id ?? "",
  title: row.title ?? "",
  parentLabel: row.parent_label ?? "",
  action: (row.action ?? "create") as ApplicationRequestAction,
  status: row.status ?? "",
  routePath: row.route_path ?? "",
  metadataJson: row.metadata_json,
  applicationGroupId: row.application_group_id ?? "",
  messageThreadId: row.message_thread_id ?? "",
  requestedByUserId: row.requested_by_user_id ?? "",
  requesterLoginName: row.requester_login_name ?? "",
  requesterDisplayName: row.requester_display_name ?? "",
  submittedAt: row.submitted_at ?? "",
  reviewedAt: row.reviewed_at ?? "",
  reviewerNote: row.reviewer_note ?? "",
}) satisfies ApprovalRequestRow);

const ensureApplicationThreadForRows = async (rows: ApprovalRequestRow[]) => {
  if (rows.length === 0) return "";
  const groupId = rows[0]?.applicationGroupId || parseRequestMetadata(rows[0]?.metadataJson).dependencyGroupId || rows[0]?.requestId;
  if (!groupId) return "";
  const existingThreadId = rows.find((row) => row.messageThreadId)?.messageThreadId ?? "";
  if (existingThreadId) return existingThreadId;
  const threadTitle =
    parseRequestMetadata(rows[0]?.metadataJson).dependencyGroupLabel ||
    rows[0]?.title ||
    rows[0]?.requestId ||
    "申請スレッド";
  const creatorUserId = rows[0]?.requestedByUserId ?? "";
  const existingRows = await queryRows(`
select message_thread_id::text as id
from public.message_threads
where thread_type = 'application'
  and application_group_id = ${sqlString(groupId)}
limit 1;
`);
  const existing = existingRows[0]?.id ?? "";
  const insertedThreadId = ((await queryRows(`
insert into public.message_threads (
  thread_type,
  title,
  visibility_scope,
  application_group_id,
  created_by_user_id
) values (
  'application',
  ${sqlString(threadTitle)},
  'all_members',
  ${sqlString(groupId)},
  ${creatorUserId ? `${sqlString(creatorUserId)}::uuid` : "null"}
)
returning message_thread_id::text as id;
`))[0]?.id ?? "");
  const threadId = existing || insertedThreadId;
  if (!threadId) return "";
  await queryRows(`
update public.application_requests
set
  application_group_id = ${sqlString(groupId)},
  message_thread_id = ${sqlString(threadId)}::uuid
where request_id in (${rows.map((row) => sqlString(row.requestId)).join(", ")});
`);
  return threadId;
};

const appendThreadMessage = async ({
  threadId,
  senderUserId,
  messageType,
  body,
  eventType,
  applicationGroupId,
  applicationRequestId,
}: {
  threadId: string;
  senderUserId?: string;
  messageType: "text" | "system";
  body: string;
  eventType?: string;
  applicationGroupId?: string;
  applicationRequestId?: string;
}) => {
  if (!threadId || !body.trim()) return;
  const insertedRows = await queryRows(`
insert into public.messages (
  message_thread_id,
  sender_user_id,
  message_type,
  body,
  event_type,
  application_request_id,
  application_group_id
) values (
  ${sqlString(threadId)}::uuid,
  ${senderUserId ? `${sqlString(senderUserId)}::uuid` : "null"},
  ${sqlString(messageType)},
  ${sqlString(body)},
  ${eventType ? sqlString(eventType) : "null"},
  ${applicationRequestId ? sqlString(applicationRequestId) : "null"},
  ${applicationGroupId ? sqlString(applicationGroupId) : "null"}
)
returning
  message_id::text as message_id,
  coalesce(created_at::text, now()::text) as created_at;
`);
  const createdAt = insertedRows[0]?.created_at ?? "";
  await queryRows(`
update public.message_threads
set
  updated_at = now(),
  last_message_at = ${createdAt ? `${sqlString(createdAt)}::timestamptz` : "now()"},
  last_message_preview = ${sqlString(body.slice(0, 120))},
  last_message_type = ${sqlString(messageType)},
  last_message_by_user_id = ${senderUserId ? `${sqlString(senderUserId)}::uuid` : "null"}
where message_thread_id = ${sqlString(threadId)}::uuid;
`);
};

const mapEntityTypeLabel = (entityType: ApplicationRequestEntityType) => {
  if (entityType === "author") return "著者";
  if (entityType === "publisher") return "出版社";
  if (entityType === "magazine_title") return "雑誌マスター";
  return "雑誌個別セット";
};

const mapRowsToItems = (rows: Record<string, string | null>[]): ApplicationRequestListItem[] => {
  const requestMetaById = new Map<string, ParsedRequestMetadata>();
  for (const row of rows) {
    requestMetaById.set(row.request_id ?? "", parseRequestMetadata(row.metadata_json));
  }
  const titleByRequestId = new Map(rows.map((row) => [row.request_id ?? "", row.title ?? ""]));
  const groupSizeById = new Map<string, number>();
  for (const row of rows) {
    const requestId = row.request_id ?? "";
    const meta = requestMetaById.get(requestId) ?? {
      dependencyGroupId: "",
      dependencyGroupLabel: "",
      dependsOnRequestIds: [],
    };
    const groupId = meta.dependencyGroupId || requestId;
    groupSizeById.set(groupId, (groupSizeById.get(groupId) ?? 0) + 1);
  }
  return rows.map((row) => {
    const requestId = row.request_id ?? "";
    const meta = requestMetaById.get(requestId) ?? {
      dependencyGroupId: "",
      dependencyGroupLabel: "",
      dependsOnRequestIds: [],
    };
    const entityType = (row.entity_type ?? "author") as ApplicationRequestEntityType;
    const action = (row.action ?? "create") as ApplicationRequestAction;
    const metadata = parseJsonObject(row.metadata_json);
    const summary = buildItemSummary(entityType, action, metadata);
    const groupId = meta.dependencyGroupId || requestId;
    return {
      id: row.id ?? "",
      requestId,
      kind: mapEntityTypeLabel(entityType),
      entityType,
      entityId: row.entity_id ?? "",
      title: row.title ?? "",
      parent: row.parent_label ?? "",
      updatedAt: row.updated_at ?? row.created_at ?? "",
      status: (row.status ?? "draft") as ApplicationRequestStatus,
      requester: row.requester_login_name ?? "",
      action,
      routePath: row.route_path ?? "",
      dependencyGroupId: meta.dependencyGroupId,
      dependencyGroupLabel: meta.dependencyGroupLabel,
      dependsOnRequestIds: meta.dependsOnRequestIds,
      dependsOnTitles: meta.dependsOnRequestIds.map((dependencyId) => titleByRequestId.get(dependencyId) || dependencyId),
      groupSize: groupSizeById.get(groupId) ?? 1,
      reviewerNote: row.reviewer_note ?? "",
      reviewedAt: row.reviewed_at ?? "",
      summaryItems: summary.summaryItems,
      changedFieldLabels: summary.changedFieldLabels,
      policyNote: summary.policyNote,
    };
  });
};

const buildSummary = (items: ApplicationRequestListItem[]): ApplicationBadgeSummary => {
  const summary: ApplicationBadgeSummary = {
    masters: {},
    issues: {},
  };
  for (const item of items) {
    const badge = {
      label: applicationActionLabelMap[item.action],
      tone: item.action,
      requestId: item.requestId,
      status: item.status,
      entityId: item.entityId,
    };
    if (item.entityType === "author" && !summary.masters.authors) {
      summary.masters.authors = badge;
      continue;
    }
    if (item.entityType === "publisher" && !summary.masters.publishers) {
      summary.masters.publishers = badge;
      continue;
    }
    if (item.entityType === "magazine_title" && !summary.masters.magazines) {
      summary.masters.magazines = badge;
      continue;
    }
    if (item.entityType === "magazine_issue_set" && item.entityId && !summary.issues[item.entityId]) {
      summary.issues[item.entityId] = badge;
    }
  }
  return summary;
};

const loadApplicationRows = async (request: NextRequest) => {
  const currentUser = await getCurrentUserContext(request);
  const whereClauses = [
    currentUser.role === "super_admin"
      ? "ar.status in ('submitted', 'on_hold')"
      : "ar.status in ('draft', 'submitted', 'on_hold')"
  ];
  if (currentUser.role !== "super_admin") {
    whereClauses.push(`ar.requested_by_user_id = ${sqlString(currentUser.id)}::uuid`);
  }
  const rows = await queryRows(`
select
  ar.id::text as id,
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  ar.metadata::text as metadata_json,
  ar.reviewer_note,
  coalesce(ar.reviewed_at::text, '') as reviewed_at,
  coalesce(ar.updated_at::text, ar.created_at::text, '') as updated_at,
  coalesce(requester.login_name, '') as requester_login_name,
  coalesce(requester.display_name, '') as requester_display_name
from public.application_requests ar
left join public.users requester
  on requester.id = ar.requested_by_user_id
where ${whereClauses.join("\n  and ")}
order by ar.updated_at desc, ar.created_at desc, ar.request_id desc;
`);
  return {
    currentUser,
    items: mapRowsToItems(rows),
  };
};

const loadApplicationHistoryRows = async (request: NextRequest, limit: number) => {
  const currentUser = await getCurrentUserContext(request);
  const whereClauses: string[] = [];
  if (currentUser.role !== "super_admin") {
    whereClauses.push(`ar.requested_by_user_id = ${sqlString(currentUser.id)}::uuid`);
  }
  const rows = await queryRows(`
select
  ar.id::text as id,
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  ar.metadata::text as metadata_json,
  ar.reviewer_note,
  coalesce(ar.reviewed_at::text, '') as reviewed_at,
  coalesce(ar.updated_at::text, ar.created_at::text, '') as updated_at,
  coalesce(requester.login_name, '') as requester_login_name,
  coalesce(requester.display_name, '') as requester_display_name
from public.application_requests ar
left join public.users requester
  on requester.id = ar.requested_by_user_id
${whereClauses.length > 0 ? `where ${whereClauses.join("\n  and ")}` : ""}
order by ar.updated_at desc, ar.created_at desc, ar.request_id desc
limit ${Math.max(1, Math.min(limit, 200))};
`);
  return {
    currentUser,
    items: mapRowsToItems(rows),
  };
};

export async function GET(request: NextRequest) {
  try {
    const view = normalizeText(request.nextUrl.searchParams.get("view"));
    if (view === "history") {
      const { items } = await loadApplicationHistoryRows(request, 50);
      return NextResponse.json({
        items,
      });
    }
    const { items } = await loadApplicationRows(request);
    if (view === "summary") {
      return NextResponse.json({
        summary: buildSummary(items),
      });
    }
    return NextResponse.json({
      items,
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to load application requests", {
      databaseMessage: "データベースに接続できないため申請一覧を読み込めません。",
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    const body = await request.json() as ApplicationMutationBody;
    const operation = normalizeText(body.operation);
    const requestIds = normalizeRequestIds(body.requestIds);
    const reviewerNote = normalizeText(body.reviewerNote);
    const submitterNote = normalizeText(body.submitterNote);
    if (requestIds.length === 0) {
      return NextResponse.json({ error: "invalid mutation" }, { status: 400 });
    }

    if (currentUser.role === "super_admin") {
      if (operation !== "approve" && operation !== "reject" && operation !== "hold") {
        return NextResponse.json({ error: "invalid admin mutation" }, { status: 400 });
      }
      const selectedRows = await queryRows(`
select
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  ar.metadata::text as metadata_json,
  coalesce(ar.application_group_id, '') as application_group_id,
  coalesce(ar.message_thread_id::text, '') as message_thread_id,
  coalesce(ar.requested_by_user_id::text, '') as requested_by_user_id,
  coalesce(requester.login_name, '') as requester_login_name,
  coalesce(requester.display_name, '') as requester_display_name,
  coalesce(ar.submitted_at::text, '') as submitted_at,
  coalesce(ar.reviewed_at::text, '') as reviewed_at,
  coalesce(ar.reviewer_note, '') as reviewer_note
from public.application_requests ar
left join public.users requester
  on requester.id = ar.requested_by_user_id
where ar.request_id in (${requestIds.map(sqlString).join(", ")});
`);
      if (selectedRows.length === 0) {
        return NextResponse.json({ error: "requests not found" }, { status: 404 });
      }
      const invalidStatusRows = selectedRows.filter((row) => (row.status ?? "") !== "submitted" && (row.status ?? "") !== "on_hold");
      if (invalidStatusRows.length > 0) {
        return NextResponse.json({ error: "submitted または on_hold の申請のみレビューできます。" }, { status: 400 });
      }
      const metaById = new Map(selectedRows.map((row) => [row.request_id ?? "", parseRequestMetadata(row.metadata_json)]));
      const groupIds = Array.from(new Set(selectedRows.map((row) => {
        const requestId = row.request_id ?? "";
        const meta = metaById.get(requestId);
        return meta?.dependencyGroupId || requestId;
      })));
      const groupedRows = await queryRows(`
select
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  ar.metadata::text as metadata_json,
  coalesce(ar.application_group_id, '') as application_group_id,
  coalesce(ar.message_thread_id::text, '') as message_thread_id,
  coalesce(ar.requested_by_user_id::text, '') as requested_by_user_id,
  coalesce(requester.login_name, '') as requester_login_name,
  coalesce(requester.display_name, '') as requester_display_name,
  coalesce(ar.submitted_at::text, '') as submitted_at,
  coalesce(ar.reviewed_at::text, '') as reviewed_at,
  coalesce(ar.reviewer_note, '') as reviewer_note
from public.application_requests ar
left join public.users requester
  on requester.id = ar.requested_by_user_id
where (${groupIds.map((groupId) => `coalesce(ar.application_group_id, ar.metadata->>'dependencyGroupId', ar.request_id) = ${sqlString(groupId)}`).join(" or ")})
  and ar.status in ('submitted', 'on_hold');
`);
      const mappedGroupRows = mapGroupRows(groupedRows);
      const groupRequestIds = mappedGroupRows.map((row) => row.requestId).filter(Boolean);
      const groupRequestIdSet = new Set(groupRequestIds);

      if (operation === "approve") {
        const unresolvedDependencies: string[] = [];
        for (const row of mappedGroupRows) {
          const requestId = row.requestId;
          const meta = parseRequestMetadata(row.metadataJson);
          for (const dependencyId of meta.dependsOnRequestIds) {
            if (groupRequestIdSet.has(dependencyId)) continue;
            const dependencyRows = await queryRows(`
select status, title
from public.application_requests
where request_id = ${sqlString(dependencyId)}
limit 1;
`);
            const dependencyRow = dependencyRows[0];
            if ((dependencyRow?.status ?? "") !== "approved") {
              unresolvedDependencies.push(`「${row.title || requestId}」は「${dependencyRow?.title ?? dependencyId}」が未承認のため承認できません。`);
            }
          }
        }
        if (unresolvedDependencies.length > 0) {
          return NextResponse.json({ error: unresolvedDependencies[0] }, { status: 400 });
        }
      }
      const nextStatus = operation === "approve" ? "approved" : operation === "reject" ? "rejected" : "on_hold";
      const result = await withTransaction(async () => {
        if (operation === "approve") {
          await applyApprovedApplicationRows(mappedGroupRows, currentUser);
        } else if (operation === "reject") {
          await syncApplicationRequestRowsWorkflowStatus(mappedGroupRows, "draft");
        }

        await queryRows(`
update public.application_requests
set
  status = ${sqlString(nextStatus)},
  reviewer_user_id = ${sqlString(currentUser.id)}::uuid,
  reviewer_note = ${sqlString(reviewerNote)},
  reviewed_at = now(),
  updated_at = now()
where request_id in (${groupRequestIds.map(sqlString).join(", ")});
`);

        let dependentRows: ApprovalRequestRow[] = [];
        if (operation === "reject") {
          const dependentRequestRows = await queryRows(`
select
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  ar.metadata::text as metadata_json,
  coalesce(ar.application_group_id, '') as application_group_id,
  coalesce(ar.message_thread_id::text, '') as message_thread_id,
  coalesce(ar.requested_by_user_id::text, '') as requested_by_user_id,
  coalesce(requester.login_name, '') as requester_login_name,
  coalesce(requester.display_name, '') as requester_display_name,
  coalesce(ar.submitted_at::text, '') as submitted_at,
  coalesce(ar.reviewed_at::text, '') as reviewed_at,
  coalesce(ar.reviewer_note, '') as reviewer_note
from public.application_requests ar
left join public.users requester
  on requester.id = ar.requested_by_user_id
where ar.status in ('submitted', 'on_hold')
  and exists (
    select 1
    from jsonb_array_elements_text(coalesce(ar.metadata->'dependsOnRequestIds', '[]'::jsonb)) dependency(request_id)
    where dependency.request_id in (${groupRequestIds.map(sqlString).join(", ")})
  );
`);
          dependentRows = mapGroupRows(dependentRequestRows);
          if (dependentRows.length > 0) {
            await syncApplicationRequestRowsWorkflowStatus(dependentRows, "draft");
            await queryRows(`
update public.application_requests dependent
set
  status = 'draft',
  submitted_at = null,
  reviewer_user_id = ${sqlString(currentUser.id)}::uuid,
  reviewer_note = '依存先申請が却下されたため編集中に戻しました。',
  reviewed_at = now(),
  updated_at = now()
where dependent.request_id in (${dependentRows.map((row) => sqlString(row.requestId)).join(", ")});
`);
          }
        }

        const threadId = await ensureApplicationThreadForRows(mappedGroupRows);
        const threadGroupId = mappedGroupRows[0]?.applicationGroupId || parseRequestMetadata(mappedGroupRows[0]?.metadataJson).dependencyGroupId || mappedGroupRows[0]?.requestId;
        const threadTitle = Array.from(new Set(mappedGroupRows.map((row) => row.title).filter(Boolean))).join("、") || mappedGroupRows[0]?.title || "申請データ";
        await appendThreadMessage({
          threadId,
          senderUserId: currentUser.id,
          messageType: "system",
          body: operation === "approve"
            ? `${threadTitle}を認証しました。`
            : operation === "reject"
              ? `${threadTitle}を却下しました。`
              : `${threadTitle}を保留にしました。`,
          eventType: operation === "approve" ? "application_approved" : operation === "reject" ? "application_rejected" : "application_on_hold",
          applicationGroupId: threadGroupId,
          applicationRequestId: mappedGroupRows[0]?.requestId,
        });
        if (reviewerNote) {
          await appendThreadMessage({
            threadId,
            senderUserId: currentUser.id,
            messageType: "text",
            body: reviewerNote,
            applicationGroupId: threadGroupId,
            applicationRequestId: mappedGroupRows[0]?.requestId,
          });
        }
        if (dependentRows.length > 0) {
          const dependentRowsByGroup = new Map<string, ApprovalRequestRow[]>();
          for (const row of dependentRows) {
            const dependentGroupId = row.applicationGroupId || parseRequestMetadata(row.metadataJson).dependencyGroupId || row.requestId;
            const current = dependentRowsByGroup.get(dependentGroupId) ?? [];
            current.push({
              ...row,
              applicationGroupId: dependentGroupId,
            });
            dependentRowsByGroup.set(dependentGroupId, current);
          }
          for (const [dependentGroupId, rows] of dependentRowsByGroup) {
            const dependentThreadId = await ensureApplicationThreadForRows(rows);
            const dependentThreadTitle = Array.from(new Set(rows.map((row) => row.title).filter(Boolean))).join("、") || rows[0]?.title || "申請データ";
            await appendThreadMessage({
              threadId: dependentThreadId,
              senderUserId: currentUser.id,
              messageType: "system",
              body: `${threadTitle} が却下されたため、${dependentThreadTitle} を編集中に戻しました。`,
              eventType: "application_dependency_returned_to_draft",
              applicationGroupId: dependentGroupId,
              applicationRequestId: rows[0]?.requestId,
            });
          }
        }
        return {
          affectedRequestIds: groupRequestIds,
          dependentRequestIds: dependentRows.map((row) => row.requestId),
        };
      });

      return NextResponse.json({ ok: true, status: nextStatus, affectedRequestIds: result.affectedRequestIds, dependentRequestIds: result.dependentRequestIds });
    }

    if (operation !== "submit" && operation !== "withdraw") {
      return NextResponse.json({ error: "invalid mutation" }, { status: 400 });
    }

    const nextStatus = operation === "submit" ? "submitted" : "draft";
    const currentStatusList = operation === "submit" ? ["draft"] : ["submitted", "on_hold"];
    const statusAssignments = operation === "submit"
      ? `status = 'submitted',
  submitted_at = now(),
  reviewer_user_id = null,
  reviewer_note = '',
  reviewed_at = null`
      : `status = 'draft',
  submitted_at = null,
  reviewer_user_id = null,
  reviewer_note = '',
  reviewed_at = null`;

    if (operation === "submit") {
      const ownedRows = await queryRows(`
select
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  ar.metadata::text as metadata_json,
  coalesce(ar.application_group_id, '') as application_group_id,
  coalesce(ar.message_thread_id::text, '') as message_thread_id,
  coalesce(ar.requested_by_user_id::text, '') as requested_by_user_id,
  coalesce(requester.login_name, '') as requester_login_name,
  coalesce(requester.display_name, '') as requester_display_name,
  coalesce(ar.submitted_at::text, '') as submitted_at,
  coalesce(ar.reviewed_at::text, '') as reviewed_at,
  coalesce(ar.reviewer_note, '') as reviewer_note
from public.application_requests ar
left join public.users requester
  on requester.id = ar.requested_by_user_id
where ar.requested_by_user_id = ${sqlString(currentUser.id)}::uuid
  and ar.status in ('draft', 'submitted');
`);
      const requestById = new Map(ownedRows.map((row) => [row.request_id ?? "", row]));
      const selectedRequestIds = new Set(requestIds);
      const dependencyErrors: string[] = [];
      for (const requestId of requestIds) {
        const row = requestById.get(requestId);
        if (!row) continue;
        const meta = parseRequestMetadata(row.metadata_json);
        const unresolvedDependencies = meta.dependsOnRequestIds
          .map((dependencyId) => requestById.get(dependencyId))
          .filter((dependencyRow) => {
            if (!dependencyRow?.request_id) return true;
            if ((dependencyRow.status ?? "") === "submitted") return false;
            return !selectedRequestIds.has(dependencyRow.request_id);
          });
        if (unresolvedDependencies.length === 0) continue;
        const dependencyTitles = unresolvedDependencies.map((dependencyRow) => dependencyRow?.title ?? dependencyRow?.request_id ?? "依存申請");
        dependencyErrors.push(`「${row.title ?? requestId}」は、${dependencyTitles.join(" / ")} を同時に申請する必要があります。`);
      }
      if (dependencyErrors.length > 0) {
        return NextResponse.json({
          error: dependencyErrors[0],
        }, {
          status: 400,
        });
      }
    }

    await queryRows(`
update public.application_requests
set
  ${statusAssignments},
  updated_at = now()
where request_id in (${requestIds.map(sqlString).join(", ")})
  and requested_by_user_id = ${sqlString(currentUser.id)}::uuid
  and status in (${currentStatusList.map(sqlString).join(", ")});
`);

    const refreshedRows = await queryRows(`
select
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  ar.metadata::text as metadata_json,
  coalesce(ar.application_group_id, '') as application_group_id,
  coalesce(ar.message_thread_id::text, '') as message_thread_id,
  coalesce(ar.requested_by_user_id::text, '') as requested_by_user_id,
  coalesce(requester.login_name, '') as requester_login_name,
  coalesce(requester.display_name, '') as requester_display_name,
  coalesce(ar.submitted_at::text, '') as submitted_at,
  coalesce(ar.reviewed_at::text, '') as reviewed_at,
  coalesce(ar.reviewer_note, '') as reviewer_note
from public.application_requests ar
left join public.users requester
  on requester.id = ar.requested_by_user_id
where ar.requested_by_user_id = ${sqlString(currentUser.id)}::uuid
  and ar.request_id in (${requestIds.map(sqlString).join(", ")});
`);
    const affectedRows = mapGroupRows(refreshedRows);
    await syncApplicationRequestRowsWorkflowStatus(affectedRows, nextStatus);
    const rowsByGroup = new Map<string, ApprovalRequestRow[]>();
    for (const row of affectedRows) {
      const groupId = row.applicationGroupId || parseRequestMetadata(row.metadataJson).dependencyGroupId || row.requestId;
      const current = rowsByGroup.get(groupId) ?? [];
      current.push({
        ...row,
        applicationGroupId: groupId,
      });
      rowsByGroup.set(groupId, current);
    }
    for (const [groupId, rows] of rowsByGroup) {
      const threadId = await ensureApplicationThreadForRows(rows);
      const threadTitle = Array.from(new Set(rows.map((row) => row.title).filter(Boolean))).join("、") || rows[0]?.title || "申請データ";
      await appendThreadMessage({
        threadId,
        senderUserId: currentUser.id,
        messageType: "system",
        body: operation === "submit"
          ? `${currentUser.loginName} が ${threadTitle} を申請しました。`
          : `${currentUser.loginName} が ${threadTitle} を編集中に戻しました。`,
        eventType: operation === "submit" ? "application_submitted" : "application_withdrawn",
        applicationGroupId: groupId,
        applicationRequestId: rows[0]?.requestId,
      });
      if (operation === "submit" && submitterNote) {
        await appendThreadMessage({
          threadId,
          senderUserId: currentUser.id,
          messageType: "text",
          body: submitterNote,
          applicationGroupId: groupId,
          applicationRequestId: rows[0]?.requestId,
        });
      }
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to update application request", {
      databaseMessage: "データベースに接続できないため申請データを更新できません。",
    });
  }
}
