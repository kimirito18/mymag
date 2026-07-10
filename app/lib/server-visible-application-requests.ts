import type { NextRequest } from "next/server";
import { getCurrentUserContext, type CurrentUserContext } from "@/app/lib/server-current-user";
import { queryRows } from "@/app/lib/server-postgres";
import type { ApplicationRequestAction, ApplicationRequestEntityType, ApplicationRequestStatus } from "@/app/lib/application-requests";

export type VisibleApplicationRequest = {
  requestId: string;
  entityType: ApplicationRequestEntityType;
  entityId: string;
  title: string;
  parentLabel: string;
  action: ApplicationRequestAction;
  status: ApplicationRequestStatus;
  routePath: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  requesterLoginName: string;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const parseJsonObject = (value: string | null | undefined) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const tryGetCurrentUserContext = async (request: NextRequest): Promise<CurrentUserContext | null> => {
  try {
    return await getCurrentUserContext(request);
  } catch {
    return null;
  }
};

export const loadVisibleApplicationRequests = async (
  request: NextRequest,
  entityType: ApplicationRequestEntityType,
): Promise<{ currentUser: CurrentUserContext | null; items: VisibleApplicationRequest[] }> => {
  const currentUser = await tryGetCurrentUserContext(request);
  if (!currentUser || currentUser.role === "viewer") {
    return {
      currentUser,
      items: [],
    };
  }

  const filters = [
    `ar.entity_type = ${sqlString(entityType)}`,
    "ar.status in ('draft', 'submitted', 'on_hold')",
  ];
  if (currentUser.role !== "super_admin") {
    filters.push(`ar.requested_by_user_id = ${sqlString(currentUser.id)}::uuid`);
  }

  const rows = await queryRows(`
select
  ar.request_id,
  ar.entity_type,
  ar.entity_id,
  ar.title,
  ar.parent_label,
  ar.action,
  ar.status,
  ar.route_path,
  coalesce(ar.updated_at::text, ar.created_at::text, '') as updated_at,
  ar.metadata::text as metadata_json,
  coalesce(u.login_name, '') as requester_login_name
from public.application_requests ar
left join public.users u
  on u.id = ar.requested_by_user_id
where ${filters.join("\n  and ")}
order by ar.updated_at desc, ar.created_at desc, ar.request_id desc;
`);

  return {
    currentUser,
    items: rows.map((row) => ({
      requestId: row.request_id ?? "",
      entityType: (row.entity_type ?? entityType) as ApplicationRequestEntityType,
      entityId: row.entity_id ?? "",
      title: row.title ?? "",
      parentLabel: row.parent_label ?? "",
      action: (row.action ?? "create") as ApplicationRequestAction,
      status: (row.status ?? "draft") as ApplicationRequestStatus,
      routePath: row.route_path ?? "",
      updatedAt: row.updated_at ?? "",
      metadata: parseJsonObject(row.metadata_json),
      requesterLoginName: row.requester_login_name ?? "",
    })),
  };
};
