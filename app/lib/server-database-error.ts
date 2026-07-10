import { NextResponse } from "next/server";
import { DATABASE_UNAVAILABLE_ERROR_CODE } from "./database-error";

const databaseUnavailableCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ETIMEDOUT",
]);

const databaseUnavailablePatterns = [
  "connect econnrefused",
  "connect etimedout",
  "connect enotfound",
  "connect ehostunreach",
  "connection terminated unexpectedly",
  "could not connect to server",
  "the database system is starting up",
  "server closed the connection unexpectedly",
];

export const isDatabaseUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const nodeError = error as NodeJS.ErrnoException;
  if (typeof nodeError.code === "string" && databaseUnavailableCodes.has(nodeError.code)) {
    return true;
  }
  const message = (error.message || "").toLowerCase();
  return databaseUnavailablePatterns.some((pattern) => message.includes(pattern));
};

export const createDatabaseUnavailableResponse = (
  message = "データベースに接続できません。",
) =>
  NextResponse.json(
    {
      error: message,
      code: DATABASE_UNAVAILABLE_ERROR_CODE,
    },
    {
      status: 503,
    },
  );

export const createRouteErrorResponse = (
  error: unknown,
  fallbackMessage: string,
  options?: {
    databaseMessage?: string;
  },
) => {
  // Server-side route policy mirrors the client:
  // - Database connectivity failures return 503 + db_unavailable so the
  //   client can switch to the dedicated full-screen route.
  // - Other failures remain ordinary 500 JSON responses and are rendered
  //   inline by the calling screen whenever possible.
  if (isDatabaseUnavailableError(error)) {
    return createDatabaseUnavailableResponse(options?.databaseMessage);
  }
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallbackMessage,
    },
    {
      status: 500,
    },
  );
};
