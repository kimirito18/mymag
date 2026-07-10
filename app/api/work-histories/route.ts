import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";

export const runtime = "nodejs";

type WorkHistoryTargetType = "author" | "publisher" | "magazine_title" | "magazine_issue";
type WorkHistoryContext =
  | "author_editor"
  | "publisher_editor"
  | "magazine_title_editor"
  | "magazine_issue_editor";

type CreateWorkHistoryBody = {
  context?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  targetLabel?: unknown;
  parentType?: unknown;
  parentId?: unknown;
  parentLabel?: unknown;
  lastAction?: unknown;
  metadata?: unknown;
};

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown)=>`${sqlString(JSON.stringify(value))}::jsonb`;

const validContexts = new Set<WorkHistoryContext>([
  "author_editor",
  "publisher_editor",
  "magazine_title_editor",
  "magazine_issue_editor"
]);

const validTargetTypes = new Set<WorkHistoryTargetType>([
  "author",
  "publisher",
  "magazine_title",
  "magazine_issue"
]);

const normalizeText = (value: unknown)=>String(value ?? "").trim();
const normalizeOptionalText = (value: unknown)=>{
  const normalized = normalizeText(value);
  return normalized || null;
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? `${currentUser.workHistoryMaxItems}`);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(currentUser.workHistoryMaxItems, Math.max(1, Math.round(requestedLimit)))
      : currentUser.workHistoryMaxItems;
    const rows = await queryRows(`
select
  work_history_id::text as work_history_id,
  context,
  target_type,
  target_id,
  target_label,
  parent_type,
  parent_id,
  parent_label,
  last_action,
  work_count::text as work_count,
  metadata::text as metadata,
  last_worked_at::text as last_worked_at
from public.work_histories
where user_id = ${sqlString(currentUser.id)}::uuid
order by last_worked_at desc, updated_at desc
limit ${limit};
`);

    return NextResponse.json({
      entries: rows.map((row)=>({
        id: row.work_history_id ?? "",
        context: row.context ?? "",
        targetType: row.target_type ?? "",
        targetId: row.target_id ?? "",
        targetLabel: row.target_label ?? "",
        parentType: row.parent_type ?? "",
        parentId: row.parent_id ?? "",
        parentLabel: row.parent_label ?? "",
        lastAction: row.last_action ?? "",
        workCount: Number(row.work_count ?? "1") || 1,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        lastWorkedAt: row.last_worked_at ?? ""
      }))
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to load work histories", {
      databaseMessage: "データベースに接続できないため作業履歴を読み込めません。",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    const body = await request.json() as CreateWorkHistoryBody;
    const context = normalizeText(body.context);
    const targetType = normalizeText(body.targetType);
    const targetId = normalizeText(body.targetId);
    const targetLabel = normalizeText(body.targetLabel);
    const lastAction = normalizeText(body.lastAction) || "open";
    const parentType = normalizeOptionalText(body.parentType);
    const parentId = normalizeOptionalText(body.parentId);
    const parentLabel = normalizeOptionalText(body.parentLabel);
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

    if (!validContexts.has(context as WorkHistoryContext)) {
      return NextResponse.json({ error: "invalid context" }, { status: 400 });
    }
    if (!validTargetTypes.has(targetType as WorkHistoryTargetType)) {
      return NextResponse.json({ error: "invalid targetType" }, { status: 400 });
    }
    if (!targetId || !targetLabel) {
      return NextResponse.json({ error: "targetId and targetLabel are required" }, { status: 400 });
    }

    await queryRows(`
insert into public.work_histories (
  user_id,
  context,
  target_type,
  target_id,
  target_label,
  parent_type,
  parent_id,
  parent_label,
  last_action,
  work_count,
  metadata,
  last_worked_at
) values (
  ${sqlString(currentUser.id)}::uuid,
  ${sqlString(context)},
  ${sqlString(targetType)},
  ${sqlString(targetId)},
  ${sqlString(targetLabel)},
  ${parentType ? sqlString(parentType) : "null"},
  ${parentId ? sqlString(parentId) : "null"},
  ${parentLabel ? sqlString(parentLabel) : "null"},
  ${sqlString(lastAction)},
  1,
  ${sqlJson(metadata)},
  now()
)
on conflict (user_id, context, target_type, target_id)
do update set
  target_label = excluded.target_label,
  parent_type = excluded.parent_type,
  parent_id = excluded.parent_id,
  parent_label = excluded.parent_label,
  last_action = excluded.last_action,
  work_count = public.work_histories.work_count + 1,
  metadata = excluded.metadata,
  last_worked_at = now(),
  updated_at = now();
`);

    await queryRows(`
delete from public.work_histories
where work_history_id in (
  select stale.work_history_id
  from (
    select work_history_id
    from public.work_histories
    where user_id = ${sqlString(currentUser.id)}::uuid
    order by last_worked_at desc, updated_at desc, created_at desc
    offset ${Math.max(0, currentUser.workHistoryMaxItems)}
  ) as stale
);
`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to upsert work history", {
      databaseMessage: "データベースに接続できないため作業履歴を保存できません。",
    });
  }
}
