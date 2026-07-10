import { cookies } from "next/headers";
import Home, { type AuthenticatedUser } from "./home-client";
import { parseAppRoute } from "./lib/app-route";
import { AUTH_COOKIE_NAME, getCurrentUserContextFromLoginName } from "./lib/server-current-user";

const loadInitialCurrentUser = async (): Promise<AuthenticatedUser | null> => {
  const cookieStore = await cookies();
  const loginName = cookieStore.get(AUTH_COOKIE_NAME)?.value?.trim() ?? "";
  if (!loginName) {
    return null;
  }
  try {
    const currentUser = await getCurrentUserContextFromLoginName(loginName);
    return {
      userId: currentUser.userId,
      loginName: currentUser.loginName,
      displayName: currentUser.displayName,
      role: currentUser.role
    };
  } catch {
    return null;
  }
};

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialCurrentUser = await loadInitialCurrentUser();
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
  const initialRoute = parseAppRoute("/", search);
  return <Home initialCurrentUser={initialCurrentUser} initialRoute={initialRoute} />;
}
