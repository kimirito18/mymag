import { queryRows } from "@/app/lib/server-postgres";
import type { ApplicationRequestAction, ApplicationRequestEntityType, ApplicationRequestStatus } from "@/app/lib/application-requests";
import type { CurrentUserContext } from "@/app/lib/server-current-user";

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;

export type DraftApplicationRequest = {
  requestId: string;
  action: ApplicationRequestAction;
  status: ApplicationRequestStatus;
};

export const isApplicationRequestLocked = (status: string | null | undefined) => status === "submitted" || status === "on_hold";

type UpsertDraftApplicationRequestInput = {
  currentUser: CurrentUserContext;
  entityType: ApplicationRequestEntityType;
  entityId: string;
  title: string;
  parentLabel: string;
  requestedAction: ApplicationRequestAction;
  routePath: string;
  metadata: Record<string, unknown>;
};

const getNextApplicationRequestId = async () => {
  const rows = await queryRows(`
select 'AR' || lpad((coalesce(max(substring(request_id from 3)::integer), 0) + 1)::text, 6, '0') as request_id
from public.application_requests
where request_id ~ '^AR[0-9]{6}$';
`);
  const requestId = rows[0]?.request_id ?? "";
  if (!requestId) {
    throw new Error("new application request id could not be generated");
  }
  return requestId;
};

export const loadActiveApplicationRequest = async (
  requestedByUserId: string,
  entityType: ApplicationRequestEntityType,
  entityId: string,
) => {
  const rows = await queryRows(`
select
  request_id,
  action,
  status,
  route_path,
  metadata::text as metadata_json
from public.application_requests
where requested_by_user_id = ${sqlString(requestedByUserId)}::uuid
  and entity_type = ${sqlString(entityType)}
  and entity_id = ${sqlString(entityId)}
  and status in ('draft', 'submitted', 'on_hold')
order by updated_at desc, created_at desc, request_id desc
limit 1;
`);
  return rows[0] ?? null;
};

export const upsertDraftApplicationRequest = async ({
  currentUser,
  entityType,
  entityId,
  title,
  parentLabel,
  requestedAction,
  routePath,
  metadata,
}: UpsertDraftApplicationRequestInput): Promise<DraftApplicationRequest> => {
  const existing = await loadActiveApplicationRequest(currentUser.id, entityType, entityId);
  const action = existing?.action === "create" && requestedAction === "update"
    ? "create"
    : requestedAction;

  if (existing?.request_id) {
    await queryRows(`
update public.application_requests
set
  title = ${sqlString(title)},
  parent_label = ${sqlString(parentLabel)},
  action = ${sqlString(action)},
  route_path = ${sqlString(routePath)},
  metadata = ${sqlJson(metadata)},
  updated_at = now()
where request_id = ${sqlString(existing.request_id)};
`);
    return {
      requestId: existing.request_id,
      action,
      status: (existing.status ?? "draft") as ApplicationRequestStatus,
    };
  }

  const requestId = await getNextApplicationRequestId();
  await queryRows(`
insert into public.application_requests (
  request_id,
  entity_type,
  entity_id,
  title,
  parent_label,
  action,
  status,
  route_path,
  metadata,
  requested_by_user_id
) values (
  ${sqlString(requestId)},
  ${sqlString(entityType)},
  ${sqlString(entityId)},
  ${sqlString(title)},
  ${sqlString(parentLabel)},
  ${sqlString(action)},
  'draft',
  ${sqlString(routePath)},
  ${sqlJson(metadata)},
  ${sqlString(currentUser.id)}::uuid
);
`);
  return {
    requestId,
    action,
    status: "draft",
  };
};
