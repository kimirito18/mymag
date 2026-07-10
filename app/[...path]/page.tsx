import { notFound } from "next/navigation";
import Home from "../home-client";
import { parseAppRoute } from "../lib/app-route";
import { AUTH_COOKIE_NAME, getCurrentUserContextFromLoginName } from "../lib/server-current-user";
import { queryRows } from "../lib/server-postgres";
import { isDatabaseUnavailableError } from "../lib/server-database-error";
import { cookies } from "next/headers";

const masterKinds = new Set(["authors", "publishers", "magazines"]);
const singleViews = new Set(["books", "approvals", "users", "authors", "publishers"]);

const isKnownRoute = (parts: string[])=>{
  if (parts.length === 0) return true;
  if (parts[0] === "masters") {
    if (!masterKinds.has(parts[1] ?? "")) return false;
    return parts.length === 2 || parts.length === 3;
  }
  if (parts[0] === "magazines") {
    if (!parts[1] || parts[2] !== "issues") return false;
    return parts.length === 3 || parts.length === 4;
  }
  if (singleViews.has(parts[0] ?? "")) {
    return parts.length === 1 || (parts[0] === "authors" || parts[0] === "publishers") && parts.length === 2;
  }
  if (parts[0] === "errors" && (parts[1] === "db-unavailable" || parts[1] === "unexpected")) {
    return parts.length === 2;
  }
  return false;
};

export default async function CatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await params;
  const parts = resolved.path ?? [];
  if (!isKnownRoute(parts)) {
    notFound();
  }
  const cookieStore = await cookies();
  const loginName = cookieStore.get(AUTH_COOKIE_NAME)?.value?.trim() ?? "";
  const isErrorRoute = parts[0] === "errors";
  let forceDatabaseUnavailableRoute = false;

  if (!isErrorRoute) {
    try {
      await queryRows("select 1 as ok;");
    } catch (error) {
      if (isDatabaseUnavailableError(error)) {
        forceDatabaseUnavailableRoute = true;
      } else {
        throw error;
      }
    }
  }

  const initialCurrentUser = !forceDatabaseUnavailableRoute && loginName
    ? await getCurrentUserContextFromLoginName(loginName).then((currentUser)=>({
        userId: currentUser.userId,
        loginName: currentUser.loginName,
        displayName: currentUser.displayName,
        role: currentUser.role
      })).catch((error)=>{
        if (isDatabaseUnavailableError(error)) {
          forceDatabaseUnavailableRoute = true;
        }
        return null;
      })
    : null;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const search = resolvedSearchParams
    ? `?${new URLSearchParams(
        Object.entries(resolvedSearchParams).flatMap(([key, value]) =>
          Array.isArray(value)
            ? value.map((entry) => [key, entry])
            : value == null
              ? []
              : [[key, value]],
        ),
      ).toString()}`
    : "";
  const pathname = forceDatabaseUnavailableRoute ? "/errors/db-unavailable" : `/${parts.map(encodeURIComponent).join("/")}`;
  const initialRoute = parseAppRoute(pathname, search);
  return <Home initialCurrentUser={initialCurrentUser} initialRoute={initialRoute} />;
}
