import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { AUTH_COOKIE_NAME } from "@/app/lib/server-current-user";
import { createDatabaseUnavailableResponse, isDatabaseUnavailableError } from "@/app/lib/server-database-error";

export const runtime = "nodejs";

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;

const normalizeText = (value: unknown)=>String(value ?? "").trim();
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
  if (loginName === "test_admin" && !displayName.trim()) return "超管理人";
  if (loginName === "test_admin" && displayName === "テスト管理者") return "超管理人";
  return displayName;
};

const readPgErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return "";
  try {
    const parsed = JSON.parse(error.message) as { M?: unknown };
    if (typeof parsed.M === "string" && parsed.M.trim()) {
      return parsed.M;
    }
  } catch {
  }
  return error.message;
};

const isMissingColumnError = (error: unknown, columnName: string) => {
  const message = readPgErrorMessage(error);
  return message.includes(`column "${columnName}" does not exist`);
};

const loadUserRecord = async (loginName: string) => {
  const loginCandidates = getLoginCandidates(loginName);
  const sqlCandidates = loginCandidates.map(sqlString).join(", ");
  const orderBy = loginCandidates.map((candidate, index)=>`when ${sqlString(candidate)} then ${index}`).join("\n    ");

  try {
    const rows = await queryRows(`
select
  id,
  user_id,
  login_name,
  display_name,
  role,
  status,
  login_password
from public.users
where login_name in (${sqlCandidates})
order by
  case login_name
    ${orderBy}
    else 999
  end
limit 1;
`);
    return {
      row: rows[0],
      schemaMode: "current" as const
    };
  } catch (error) {
    if (!isMissingColumnError(error, "login_password")) {
      throw error;
    }
    const rows = await queryRows(`
select
  id,
  user_id,
  login_name,
  display_name,
  role,
  status
from public.users
where login_name in (${sqlCandidates})
order by
  case login_name
    ${orderBy}
    else 999
  end
limit 1;
`);
    return {
      row: rows[0],
      schemaMode: "legacy" as const
    };
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { loginName?: unknown; password?: unknown };
    const loginName = normalizeText(body.loginName);
    const password = normalizeText(body.password);

    if (!loginName || !password) {
      return NextResponse.json({ error: "アカウント名とパスワードを入力してください。" }, { status: 400 });
    }

    const { row, schemaMode } = await loadUserRecord(loginName);
    if (!row?.id || row.status !== "active") {
      return NextResponse.json({ error: "アカウント名またはパスワードが正しくありません。" }, { status: 401 });
    }
    const isPasswordValid = schemaMode === "legacy"
      ? password === "guest"
      : String(row.login_password ?? "") === password;
    if (!isPasswordValid) {
      return NextResponse.json({ error: "アカウント名またはパスワードが正しくありません。" }, { status: 401 });
    }

    await queryRows(`
update public.users
set
  last_login_at = now(),
  updated_at = now()
where id = ${sqlString(String(row.id))}::uuid;
`);

    const response = NextResponse.json({
      authenticated: true,
      user: {
        userId: String(row.user_id ?? ""),
        loginName: normalizeLoginName(String(row.login_name ?? "")),
        displayName: normalizeDisplayName(String(row.login_name ?? ""), String(row.display_name ?? "")),
        role: String(row.role ?? "viewer")
      }
    });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: String(row.login_name ?? loginName),
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 12
    });
    return response;
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return createDatabaseUnavailableResponse("データベースに接続できないためログインできません。");
    }
    return NextResponse.json({
      error: isMissingColumnError(error, "login_password")
        ? "ログイン用の設定がまだ未反映です。旧方式での確認に切り替えます。"
        : "ログインに失敗しました。"
    }, {
      status: 500
    });
  }
}
