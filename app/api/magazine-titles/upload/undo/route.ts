import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { queryRows, withTransaction } from "@/app/lib/server-postgres";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";

export const runtime = "nodejs";

type UndoSnapshotEntry = {
  action: "create" | "update";
  id: string;
  internalId: string;
  beforeRow: Record<string, unknown> | null;
  afterRow: Record<string, unknown> | null;
};

type UploadUndoPayload = {
  magazines: UndoSnapshotEntry[];
  publishers: UndoSnapshotEntry[];
};

const MAGAZINE_RESTORE_COLUMNS = [
  "publisher_key",
  "publisher_id",
  "title",
  "title_reading",
  "title_variants",
  "publishers",
  "publication_frequency",
  "first_published_date",
  "closed_date",
  "issn",
  "jpno",
  "note",
  "related_magazines",
  "relation_note",
  "tags",
  "search_text",
  "search_reading",
  "record_status",
  "owner_user_id",
  "created_by",
  "updated_by",
  "approved_by",
  "approved_at",
  "deleted_by",
  "deleted_at",
  "delete_reason",
] as const;

const PUBLISHER_RESTORE_COLUMNS = [
  "publisher_name",
  "publisher_reading",
  "address",
  "url",
  "related_link",
  "memo",
  "related_publishers",
  "tags",
  "search_text",
  "record_status",
  "owner_user_id",
  "created_by",
  "updated_by",
  "approved_by",
  "approved_at",
  "deleted_by",
  "deleted_at",
  "delete_reason",
] as const;

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlJson = (value: unknown) => `${sqlString(JSON.stringify(value))}::jsonb`;
const sqlAuthUserRef = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "null";
  return `${sqlString(normalized)}::uuid`;
};

const parseJsonObject = <T,>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const restoreMagazineSnapshot = async (internalId: string, snapshot: Record<string, unknown>) => {
  const setSql = MAGAZINE_RESTORE_COLUMNS.map((column) => `${column} = snapshot.${column}`).join(",\n  ");
  await queryRows(`
with snapshot as (
  select *
  from jsonb_populate_record(null::public.magazine_titles, ${sqlJson(snapshot)})
)
update public.magazine_titles mt
set
  ${setSql}
from snapshot
where mt.id = ${sqlString(internalId)}
returning mt.magazine_id;
`);
};

const restorePublisherSnapshot = async (internalId: string, snapshot: Record<string, unknown>) => {
  const setSql = PUBLISHER_RESTORE_COLUMNS.map((column) => `${column} = snapshot.${column}`).join(",\n  ");
  await queryRows(`
with snapshot as (
  select *
  from jsonb_populate_record(null::public.publishers, ${sqlJson(snapshot)})
)
update public.publishers p
set
  ${setSql}
from snapshot
where p.id = ${sqlString(internalId)}
returning p.publisher_id;
`);
};

const softDeleteMagazine = async (internalId: string, currentUserId: string) => {
  await queryRows(`
update public.magazine_titles
set
  record_status = 'deleted',
  updated_by = ${sqlAuthUserRef(currentUserId)},
  approved_by = ${sqlAuthUserRef(currentUserId)},
  deleted_by = ${sqlAuthUserRef(currentUserId)},
  deleted_at = now(),
  delete_reason = 'csv_upload_undo'
where id = ${sqlString(internalId)}
  and record_status <> 'deleted';
`);
};

const softDeletePublisher = async (internalId: string, currentUserId: string) => {
  await queryRows(`
update public.publishers
set
  record_status = 'deleted',
  updated_by = ${sqlAuthUserRef(currentUserId)},
  approved_by = ${sqlAuthUserRef(currentUserId)},
  deleted_by = ${sqlAuthUserRef(currentUserId)},
  deleted_at = now(),
  delete_reason = 'csv_upload_undo'
where id = ${sqlString(internalId)}
  and record_status <> 'deleted';
`);
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    const rows = await queryRows(`
select
  id::text,
  target_id,
  metadata::text as metadata,
  created_at::text as created_at
from public.user_logs
where user_id = ${sqlString(currentUser.id)}::uuid
  and log_type = 'undo_action'
  and target_type = 'magazine_csv_upload'
  and undone_at is null
order by created_at desc, id desc
limit 1;
`);
    const row = rows[0];
    if (!row?.id) {
      return NextResponse.json({
        available: false,
      });
    }
    const metadata = parseJsonObject<Record<string, unknown>>(row.metadata, {});
    return NextResponse.json({
      available: true,
      actionId: row.target_id ?? "",
      label: String(metadata.label ?? "Undo Upload"),
      fileName: String(metadata.fileName ?? ""),
      importedCount: Number(metadata.importedCount ?? 0) || 0,
      createCount: Number(metadata.createCount ?? 0) || 0,
      updateCount: Number(metadata.updateCount ?? 0) || 0,
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to load upload undo state", {
      databaseMessage: "データベースに接続できないため雑誌マスターCSV Undo情報を読み込めません。",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    const rows = await queryRows(`
select
  id::text,
  target_id,
  metadata::text as metadata,
  before_data::text as before_data,
  after_data::text as after_data
from public.user_logs
where user_id = ${sqlString(currentUser.id)}::uuid
  and log_type = 'undo_action'
  and target_type = 'magazine_csv_upload'
  and undone_at is null
order by created_at desc, id desc
limit 1;
`);
    const targetLog = rows[0];
    if (!targetLog?.id) {
      return NextResponse.json(
        {
          error: "undo upload action not found",
        },
        { status: 404 },
      );
    }

    const metadata = parseJsonObject<Record<string, unknown>>(targetLog.metadata, {});
    const payload = parseJsonObject<UploadUndoPayload>(targetLog.before_data, {
      magazines: [],
      publishers: [],
    });

    await withTransaction(async () => {
      for (const entry of payload.magazines.filter((row) => row.action === "create").reverse()) {
        await softDeleteMagazine(entry.internalId, currentUser.id);
      }

      for (const entry of payload.magazines.filter((row) => row.action === "update").reverse()) {
        if (!entry.beforeRow) continue;
        await restoreMagazineSnapshot(entry.internalId, entry.beforeRow);
      }

      for (const entry of payload.publishers.filter((row) => row.action === "create").reverse()) {
        await softDeletePublisher(entry.internalId, currentUser.id);
      }

      for (const entry of payload.publishers.filter((row) => row.action === "update").reverse()) {
        if (!entry.beforeRow) continue;
        await restorePublisherSnapshot(entry.internalId, entry.beforeRow);
      }

      await queryRows(`
update public.user_logs
set undone_at = now()
where id = ${sqlString(String(targetLog.id))}::bigint;
`);

      await queryRows(`
insert into public.user_logs (
  user_id,
  actor_user_id,
  log_type,
  target_type,
  target_id,
  metadata,
  before_data,
  after_data,
  note,
  related_log_id
) values (
  ${sqlString(currentUser.id)}::uuid,
  ${sqlString(currentUser.id)}::uuid,
  'undo_applied',
  'magazine_csv_upload',
  ${sqlString(String(targetLog.target_id ?? ""))},
  ${sqlJson(metadata)},
  ${sqlString(targetLog.after_data ?? "{}")}::jsonb,
  ${sqlString(targetLog.before_data ?? "{}")}::jsonb,
  'undo_upload_apply',
  ${sqlString(String(targetLog.id))}::bigint
);
`);
    });

    return NextResponse.json({
      label: String(metadata.label ?? "Undo Upload"),
      importedCount: Number(metadata.importedCount ?? 0) || 0,
    });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to apply upload undo", {
      databaseMessage: "データベースに接続できないため雑誌マスターCSV Undoを実行できません。",
    });
  }
}
