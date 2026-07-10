export const DATABASE_UNAVAILABLE_ERROR_CODE = "db_unavailable";

export type AppErrorRouteKind = "db-unavailable" | "unexpected";

export type ApiErrorResponseLike = {
  error?: string;
  code?: string;
} | null | undefined;

export const buildErrorRoutePath = (kind: AppErrorRouteKind) => `/errors/${kind}`;

export const isDatabaseUnavailableApiError = (
  response: { status: number },
  body?: ApiErrorResponseLike,
) => response.status === 503 || body?.code === DATABASE_UNAVAILABLE_ERROR_CODE;

// Client-side error routing policy:
// - Database connectivity failures alone are promoted to the dedicated
//   full-screen error route.
// - Ordinary 4xx / 5xx API failures stay inline in each editor or dialog.
// - The shared unexpected route is reserved for uncaught UI/runtime failures.
export const resolveApiErrorRouteKind = (
  response: { status: number },
  body?: ApiErrorResponseLike,
): AppErrorRouteKind | null => (
  isDatabaseUnavailableApiError(response, body) ? "db-unavailable" : null
);
