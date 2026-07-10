import type { MasterEditorKind, ViewKey } from "./types";
import type { AppErrorRouteKind } from "./database-error";

export type RouteContext = {
  from?: string;
  issue?: string;
};

export type ParsedRoute = {
  view: ViewKey;
  errorKind?: AppErrorRouteKind;
  masterKind?: MasterEditorKind;
  masterId?: string;
  magazineId?: string;
  issueId?: string;
  isNewIssue?: boolean;
  context?: RouteContext;
};

const masterPathSegmentsToKind: Record<string, MasterEditorKind> = {
  authors: "authors",
  publishers: "publishers",
  magazines: "magazines",
};

const decodePathSegment = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseAppRoute = (pathname: string, search: string): ParsedRoute | null => {
  const params = new URLSearchParams(search);
  const context: RouteContext = {};
  const from = params.get("from");
  const issue = params.get("issue");
  if (from) context.from = from;
  if (issue) context.issue = issue;
  const parts = pathname.split("/").filter(Boolean).map(decodePathSegment);
  if (parts.length === 0) return null;
  if (parts[0] === "masters") {
    const kind = masterPathSegmentsToKind[parts[1] ?? ""];
    if (!kind) return null;
    return {
      view: kind,
      masterKind: kind,
      masterId: parts[2],
      context,
    };
  }
  if (parts[0] === "magazines" && parts[1] && parts[2] === "issues") {
    const issueId = parts[3];
    return {
      view: "mi",
      magazineId: parts[1],
      issueId: issueId === "new" ? undefined : issueId,
      isNewIssue: issueId === "new",
      context,
    };
  }
  if (parts[0] === "errors" && (parts[1] === "db-unavailable" || parts[1] === "unexpected")) {
    return {
      view: "view",
      errorKind: parts[1] as AppErrorRouteKind,
      context,
    };
  }
  if (parts[0] === "authors") {
    return {
      view: "authors",
      masterKind: "authors",
      masterId: parts[1],
      context,
    };
  }
  if (parts[0] === "publishers") {
    return {
      view: "publishers",
      masterKind: "publishers",
      masterId: parts[1],
      context,
    };
  }
  if (parts[0] === "books" || parts[0] === "approvals" || parts[0] === "users") {
    return {
      view: parts[0] as ViewKey,
      context,
    };
  }
  return null;
};
