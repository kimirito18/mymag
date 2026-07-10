import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";

export const runtime = "nodejs";

type UndoApiAction = {
  kind: "issue" | "story" | "content";
  issueId: string;
  field: string;
  beforeValue: unknown;
  afterValue: unknown;
  label: string;
  rowIndex?: number;
  timestamp: number;
};
type UpdateUndoSettingsBody = {
  undoStackLimit?: unknown;
};

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown)=>`${sqlString(JSON.stringify(value))}::jsonb`;

const normalizeIssueId = (value: string | null)=>{
  const normalized = value?.trim() ?? "";
  return /^MI[0-9]{7}$/.test(normalized) ? normalized : "";
};

const rowToUndoAction = (row: Record<string, string | null>): UndoApiAction | null => {
  try {
    const metadata = JSON.parse(row.metadata ?? "{}") as Record<string, unknown>;
    const kind = String(metadata.kind ?? "").trim();
    const issueId = String(metadata.issueId ?? row.target_id ?? "").trim();
    const field = String(metadata.field ?? "").trim();
    if (!issueId || !field || (kind !== "issue" && kind !== "story" && kind !== "content")) return null;
    return {
      kind,
      issueId,
      field,
      beforeValue: metadata.beforeValue ?? null,
      afterValue: metadata.afterValue ?? null,
      label: String(metadata.label ?? "元に戻す"),
      rowIndex: metadata.rowIndex == null ? undefined : Number(metadata.rowIndex),
      timestamp: Date.parse(row.created_at ?? "") || Date.now()
    };
  } catch {
    return null;
  }
};

export async function GET(request: NextRequest) {
  try {
    const issueId = normalizeIssueId(request.nextUrl.searchParams.get("issueId"));
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
  target_id,
  created_at::text as created_at
from public.user_logs
where user_id = ${sqlString(currentUser.id)}::uuid
  and log_type = 'undo_action'
  and target_type = 'magazine_issue'
  and target_id = ${sqlString(issueId)}
  and undone_at is null
order by created_at desc, id desc
limit ${Math.max(1, currentUser.undoStackLimit)};
`);

    return NextResponse.json({
      currentUser: {
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        role: currentUser.role
      },
      limit: currentUser.undoStackLimit,
      actions: rows.map(rowToUndoAction).filter((action): action is UndoApiAction => Boolean(action))
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to load undo actions", {
      databaseMessage: "データベースに接続できないためUndo履歴を読み込めません。",
    });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as UpdateUndoSettingsBody;
    const numericValue = Number(body.undoStackLimit);
    const undoStackLimit = Number.isFinite(numericValue) ? Math.min(20, Math.max(1, Math.round(numericValue))) : 3;
    const currentUser = await getCurrentUserContext(request);
    await queryRows(`
update public.user_settings
set
  ui_settings = coalesce(ui_settings, '{}'::jsonb) || ${sqlJson({
      undo_stack_limit: undoStackLimit
    })},
  updated_at = now()
where user_id = ${sqlString(currentUser.id)}::uuid;
`);
    return NextResponse.json({
      limit: undoStackLimit
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to update undo settings", {
      databaseMessage: "データベースに接続できないためUndo設定を更新できません。",
    });
  }
}
