import type { NextRequest } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";

export const AUTH_COOKIE_NAME = "mymag_login";

export type CurrentUserContext = {
  id: string;
  userId: string;
  loginName: string;
  displayName: string;
  role: "super_admin" | "expert" | "viewer";
  undoStackLimit: number;
  workHistoryMaxItems: number;
};

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;
const legacyLoginAliasMap: Record<string, string[]> = {
  admin: ["admin", "test_admin"],
  test_admin: ["test_admin", "admin"],
};

const getLoginCandidates = (loginName: string) => {
  const normalized = loginName.trim();
  if (!normalized) return [];
  return legacyLoginAliasMap[normalized] ?? [normalized];
};

const normalizeLoginName = (loginName: string) => {
  if (loginName === "test_admin") return "admin";
  return loginName;
};

const normalizeDisplayName = (loginName: string, displayName: string) => {
  if (loginName === "test_admin" && !displayName.trim()) {
    return "超管理人";
  }
  if (loginName === "test_admin" && displayName === "テスト管理者") {
    return "超管理人";
  }
  return displayName;
};

const readLoginNameFromRequest = (request: NextRequest) => {
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
  const loginName = cookieValue.trim();
  return loginName || null;
};

export const getCurrentUserContextFromLoginName = async (loginName: string): Promise<CurrentUserContext> => {
  if (!loginName) {
    throw new Error("authentication required");
  }
  const loginCandidates = getLoginCandidates(loginName);
  if (loginCandidates.length === 0) {
    throw new Error("authentication required");
  }
  const sqlCandidates = loginCandidates.map(sqlString).join(", ");

  const rows = await queryRows(`
select
  u.id,
  u.user_id,
  u.login_name,
  u.display_name,
  u.role,
  coalesce((us.ui_settings->>'undo_stack_limit')::integer, 3) as undo_stack_limit,
  coalesce((us.ui_settings->>'history_max_items')::integer, 20) as history_max_items
from public.users u
left join public.user_settings us
  on us.user_id = u.id
where u.login_name in (${sqlCandidates})
  and u.status = 'active'
order by
  case u.login_name
    ${loginCandidates.map((candidate, index)=>`when ${sqlString(candidate)} then ${index}`).join("\n    ")}
    else 999
  end
limit 1;
`);

  const row = rows[0];
  if (!row?.id) {
    throw new Error("authenticated user not found");
  }

  const undoStackLimit = Number(row.undo_stack_limit ?? "3");
  const workHistoryMaxItems = Number(row.history_max_items ?? "20");
  const resolvedLoginName = String(row.login_name ?? loginName);
  return {
    id: String(row.id),
    userId: String(row.user_id ?? ""),
    loginName: normalizeLoginName(resolvedLoginName),
    displayName: normalizeDisplayName(resolvedLoginName, String(row.display_name ?? "")),
    role: (String(row.role ?? "super_admin") as CurrentUserContext["role"]),
    undoStackLimit: Number.isFinite(undoStackLimit) ? undoStackLimit : 3,
    workHistoryMaxItems: Number.isFinite(workHistoryMaxItems) ? workHistoryMaxItems : 20
  };
};

export const getCurrentUserContext = async (request: NextRequest): Promise<CurrentUserContext> => {
  const loginName = readLoginNameFromRequest(request);
  return getCurrentUserContextFromLoginName(loginName ?? "");
};
