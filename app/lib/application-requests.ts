export type ApplicationRequestAction = "create" | "update" | "delete";

export type ApplicationRequestStatus = "draft" | "submitted" | "on_hold" | "approved" | "rejected";

export type ApplicationRequestEntityType = "author" | "publisher" | "magazine_title" | "magazine_issue_set";

export type ApplicationRequestListItem = {
  id: string;
  requestId: string;
  kind: string;
  entityType: ApplicationRequestEntityType;
  entityId: string;
  title: string;
  parent: string;
  updatedAt: string;
  status: ApplicationRequestStatus;
  requester?: string;
  action: ApplicationRequestAction;
  routePath: string;
  dependencyGroupId: string;
  dependencyGroupLabel: string;
  dependsOnRequestIds: string[];
  dependsOnTitles: string[];
  groupSize: number;
  reviewerNote: string;
  reviewedAt: string;
  summaryItems: string[];
  changedFieldLabels: string[];
  policyNote: string;
};

export type ApplicationRequestListResponse = {
  items?: ApplicationRequestListItem[];
  error?: string;
};

export type ApplicationBadgeSummary = {
  masters: Partial<Record<"authors" | "publishers" | "magazines", {
    label: string;
    tone: ApplicationRequestAction;
    requestId: string;
    status: ApplicationRequestStatus;
    entityId: string;
  }>>;
  issues: Record<string, {
    label: string;
    tone: ApplicationRequestAction;
    requestId: string;
    status: ApplicationRequestStatus;
    entityId: string;
  }>;
};

export type ApplicationSummaryResponse = {
  summary?: ApplicationBadgeSummary;
  error?: string;
};

export const applicationActionLabelMap: Record<ApplicationRequestAction, string> = {
  create: "申請新規",
  update: "申請修正",
  delete: "申請削除",
};

export const applicationStatusLabelMap: Record<ApplicationRequestStatus, string> = {
  draft: "編集中",
  submitted: "申請中",
  on_hold: "保留中",
  approved: "承認済み",
  rejected: "却下",
};

export const formatApplicationUpdatedAt = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};
