import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { loadActiveApplicationRequest, upsertDraftApplicationRequest } from "@/app/lib/application-request-drafts";

export const runtime = "nodejs";

type ApplyBody = {
  issueId?: unknown;
};

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown)=>`${sqlString(JSON.stringify(value))}::jsonb`;

const normalizeIssueId = (value: unknown)=>{
  const normalized = String(value ?? "").trim();
  return /^MI[0-9]{7}$/.test(normalized) ? normalized : "";
};

const parseJsonObject = (value: string | null | undefined)=>{
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const ISSUE_RESTORE_COLUMNS = [
  "source_issue_key",
  "magazine_id",
  "magazine_key",
  "publisher_id",
  "publisher_key",
  "issue_title",
  "issue_title_reading",
  "issue_label",
  "subtitle",
  "subtitle_reading",
  "publication_frequency",
  "media_format",
  "published_date",
  "year",
  "month",
  "day",
  "release_year",
  "release_month",
  "release_day",
  "display_year",
  "display_month",
  "display_day",
  "display_combined_month",
  "display_combined_day",
  "publication_year",
  "publication_month",
  "publication_day",
  "publication_combined_month",
  "publication_combined_day",
  "volume_number",
  "issue_number",
  "total_issue_number",
  "issue_number_displayed",
  "sub_issue_number",
  "volume_issue_note",
  "publisher_name",
  "publishers",
  "publisher_person",
  "editor_person",
  "related_magazines",
  "binding",
  "magazine_code",
  "category",
  "rating",
  "price",
  "size",
  "number_of_pages",
  "is_special_issue",
  "is_mitsumine",
  "contents",
  "note",
  "source_work_count",
  "source_first_work_id",
  "tags",
  "search_text",
  "search_reading",
  "record_status"
];

const STORY_RESTORE_COLUMNS = [
  "story_type",
  "series_title",
  "series_title_reading",
  "episode_number",
  "episode_number_sort",
  "title",
  "title_reading",
  "title_reading_core",
  "subtitle",
  "subtitle_reading",
  "contributors",
  "page_count",
  "is_first_episode",
  "is_final_episode",
  "first_published_date",
  "first_magazine_issue_id",
  "first_magazine_issue_key",
  "status",
  "merged_into_story_id",
  "merged_into_story_key",
  "color_info",
  "memo",
  "tags",
  "source_work_ids",
  "source_occurrences",
  "search_text",
  "search_reading",
  "record_status"
];

const restoreIssueSnapshot = async (issueId: string, snapshot: Record<string, unknown>)=>{
  const setSql = ISSUE_RESTORE_COLUMNS.map((column)=>`${column} = snapshot.${column}`).join(",\n  ");
  await queryRows(`
with snapshot as (
  select *
  from jsonb_populate_record(null::public.magazine_issues, ${sqlJson(snapshot)})
)
update public.magazine_issues mi
set
  ${setSql}
from snapshot
where mi.magazine_issue_id = ${sqlString(issueId)}
returning mi.magazine_issue_id;
`);
};

const restoreStorySnapshot = async (storyId: string, snapshot: Record<string, unknown>)=>{
  const setSql = STORY_RESTORE_COLUMNS.map((column)=>`${column} = snapshot.${column}`).join(",\n  ");
  await queryRows(`
with snapshot as (
  select *
  from jsonb_populate_record(null::public.stories, ${sqlJson(snapshot)})
)
update public.stories s
set
  ${setSql}
from snapshot
where s.story_id = ${sqlString(storyId)}
returning s.story_id;
`);
};

const deleteStoryForUndo = async (storyId: string)=>{
  await queryRows(`
update public.stories
set
  status = 'deleted',
  record_status = case
    when record_status = 'published' then 'deleted'
    else record_status
  end,
  approved_at = null
where story_id = ${sqlString(storyId)}
returning story_id;
`);
};

const restoreIssueRequestSnapshot = async ({
  currentUser,
  issueId,
  snapshot,
}: {
  currentUser: Awaited<ReturnType<typeof getCurrentUserContext>>;
  issueId: string;
  snapshot: Record<string, unknown>;
})=>{
  const magazineId = String(snapshot.magazineId ?? "").trim();
  if (!magazineId) {
    throw new Error("undo request snapshot is missing magazineId");
  }
  const existingRequest = await loadActiveApplicationRequest(currentUser.id, "magazine_issue_set", issueId);
  await upsertDraftApplicationRequest({
    currentUser,
    entityType: "magazine_issue_set",
    entityId: issueId,
    title: String(snapshot.issueLabel ?? snapshot.issueTitle ?? issueId).trim() || issueId,
    parentLabel: String(snapshot.magazineTitle ?? snapshot.issueTitle ?? "").trim(),
    requestedAction: existingRequest?.action === "create" ? "create" : "update",
    routePath: `/magazines/${magazineId}/issues/${issueId}?from=issue-list`,
    metadata: snapshot
  });
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ApplyBody;
    const issueId = normalizeIssueId(body.issueId);
    if (!issueId) {
      return NextResponse.json({
        error: "invalid issueId"
      }, {
        status: 400
      });
    }

    const currentUser = await getCurrentUserContext(request);
    const rows = await queryRows(`
select
  id::text,
  metadata::text as metadata,
  before_data::text as before_data,
  after_data::text as after_data,
  note
from public.user_logs
where user_id = ${sqlString(currentUser.id)}::uuid
  and log_type = 'undo_action'
  and target_type = 'magazine_issue'
  and target_id = ${sqlString(issueId)}
  and undone_at is null
order by created_at desc, id desc
limit ${Math.max(1, currentUser.undoStackLimit)};
`);

    const targetLog = rows[0];
    if (!targetLog?.id) {
      return NextResponse.json({
        error: "undo action not found"
      }, {
        status: 404
      });
    }

    const metadata = parseJsonObject(targetLog.metadata);
    const beforeData = parseJsonObject(targetLog.before_data);
    const afterData = parseJsonObject(targetLog.after_data);
    const kind = String(metadata.kind ?? "").trim();
    const label = String(metadata.label ?? "元に戻す");
    const storageMode = String(metadata.storageMode ?? "").trim();

    if (storageMode === "application_request") {
      await restoreIssueRequestSnapshot({
        currentUser,
        issueId,
        snapshot: beforeData
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
  'undo',
  'application_requests',
  ${sqlString(issueId)},
  ${sqlString(label)},
  ${sqlJson({
          metadata,
          row: afterData
      })},
  ${sqlJson({
          metadata,
          row: beforeData
      })},
  ${sqlString(currentUser.role)},
  'undo_apply'
);
`);
    } else if (kind === "issue" || kind === "content") {
      await restoreIssueSnapshot(issueId, beforeData);
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
  'undo',
  'magazine_issues',
  ${sqlString(issueId)},
  ${sqlString(label)},
  ${sqlJson({
          metadata,
          row: afterData
      })},
  ${sqlJson({
          metadata,
          row: beforeData
      })},
  ${sqlString(currentUser.role)},
  'undo_apply'
);
`);
    } else if (kind === "story") {
      const storyId = String(metadata.storyId ?? "").trim();
      if (!storyId) {
        return NextResponse.json({
          error: "storyId is missing in undo log"
        }, {
          status: 400
        });
      }
      const action = String(metadata.action ?? "update").trim();
      if (action === "create") {
        await deleteStoryForUndo(storyId);
      } else {
        await restoreStorySnapshot(storyId, beforeData);
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
  'undo',
  'stories',
  ${sqlString(storyId)},
  ${sqlString(label)},
  ${sqlJson({
          metadata,
          row: afterData
      })},
  ${sqlJson({
          metadata,
          row: beforeData
      })},
  ${sqlString(currentUser.role)},
  'undo_apply'
);
`);
    } else {
      return NextResponse.json({
        error: "unsupported undo kind"
      }, {
        status: 400
      });
    }

    await queryRows(`
update public.user_logs
set undone_at = now()
where id = ${sqlString(String(targetLog.id))}::bigint;
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
  note,
  related_log_id
) values (
  ${sqlString(currentUser.id)}::uuid,
  ${sqlString(currentUser.id)}::uuid,
  'undo_applied',
  'magazine_issue',
  ${sqlString(issueId)},
  ${sqlJson(metadata)},
  ${sqlJson(afterData)},
  ${sqlJson(beforeData)},
  'undo_apply',
  ${sqlString(String(targetLog.id))}::bigint
);
`);

    return NextResponse.json({
      issueId,
      label
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to apply undo", {
      databaseMessage: "データベースに接続できないためUndoを実行できません。",
    });
  }
}
