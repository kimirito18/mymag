import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    if (currentUser.role !== "super_admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const rows = await queryRows(`
select
  u.user_id,
  u.login_name,
  u.display_name,
  u.role,
  u.status,
  u.last_login_at::text as last_login_at,
  coalesce((us.ui_settings->>'undo_stack_limit')::integer, 3)::text as undo_stack_limit,
  coalesce((us.ui_settings->>'history_max_items')::integer, 20)::text as history_max_items
from public.users u
left join public.user_settings us
  on us.user_id = u.id
where u.status <> 'deleted'
order by
  case u.role
    when 'super_admin' then 0
    when 'expert' then 1
    else 2
  end,
  u.login_name asc;
`);

    return NextResponse.json({
      records: rows.map((row)=>({
        userId: row.user_id ?? "",
        loginName: row.login_name ?? "",
        displayName: row.display_name ?? "",
        role: row.role ?? "viewer",
        status: row.status ?? "active",
        lastLoginAt: row.last_login_at ?? "",
        undoStackLimit: Number(row.undo_stack_limit ?? "3") || 3,
        workHistoryMaxItems: Number(row.history_max_items ?? "20") || 20
      }))
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to load users", {
      databaseMessage: "データベースに接続できないためユーザー一覧を読み込めません。",
    });
  }
}
