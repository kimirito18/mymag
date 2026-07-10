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
  beforeAliases: Array<Record<string, unknown>>;
  afterAliases: Array<Record<string, unknown>>;
};

type UploadUndoPayload = { authors: UndoSnapshotEntry[] };

const AUTHOR_RESTORE_COLUMNS = [
  "author_name",
  "author_reading",
  "social_links",
  "memo",
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

const restoreAuthorSnapshot = async (internalId: string, snapshot: Record<string, unknown>) => {
  const setSql = AUTHOR_RESTORE_COLUMNS.map((column) => `${column} = snapshot.${column}`).join(",\n  ");
  await queryRows(`
with snapshot as (
  select *
  from jsonb_populate_record(null::public.authors, ${sqlJson(snapshot)})
)
update public.authors a
set
  ${setSql}
from snapshot
where a.id = ${sqlString(internalId)}
returning a.author_id;
`);
};

const clearAuthorAliases = async (authorId: string, internalId: string) => {
  await queryRows(`
delete from public.author_alias_links
where author_id_1 = ${sqlString(authorId)}
   or author_id_2 = ${sqlString(authorId)}
   or author_key_1 = ${sqlString(internalId)}
   or author_key_2 = ${sqlString(internalId)};
`);
};

const restoreAuthorAliases = async (authorId: string, internalId: string, snapshotRows: Array<Record<string, unknown>>) => {
  await clearAuthorAliases(authorId, internalId);
  if (snapshotRows.length === 0) return;
  await queryRows(`
insert into public.author_alias_links (
  author_id_1,
  author_id_2,
  relation_kind,
  memo,
  created_by,
  created_at,
  author_key_1,
  author_key_2
)
select
  snapshot.author_id_1,
  snapshot.author_id_2,
  snapshot.relation_kind,
  snapshot.memo,
  snapshot.created_by,
  snapshot.created_at,
  snapshot.author_key_1,
  snapshot.author_key_2
from jsonb_to_recordset(${sqlJson(snapshotRows)}) as snapshot(
  author_id_1 text,
  author_id_2 text,
  relation_kind text,
  memo text,
  created_by uuid,
  created_at timestamptz,
  author_key_1 text,
  author_key_2 text
)
on conflict (author_id_1, author_id_2) do nothing;
`);
};

const softDeleteAuthor = async (internalId: string, currentUserId: string) => {
  await queryRows(`
update public.authors
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
select id::text, target_id, metadata::text as metadata
from public.user_logs
where user_id = ${sqlString(currentUser.id)}::uuid
  and log_type = 'undo_action'
  and target_type = 'author_csv_upload'
  and undone_at is null
order by created_at desc, id desc
limit 1;
`);
    const row = rows[0];
    if (!row?.id) return NextResponse.json({ available: false });
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
      databaseMessage: "データベースに接続できないため著者CSV Undo情報を読み込めません。",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    const rows = await queryRows(`
select id::text, target_id, metadata::text as metadata, before_data::text as before_data, after_data::text as after_data
from public.user_logs
where user_id = ${sqlString(currentUser.id)}::uuid
  and log_type = 'undo_action'
  and target_type = 'author_csv_upload'
  and undone_at is null
order by created_at desc, id desc
limit 1;
`);
    const targetLog = rows[0];
    if (!targetLog?.id) return NextResponse.json({ error: "undo upload action not found" }, { status: 404 });
    const metadata = parseJsonObject<Record<string, unknown>>(targetLog.metadata, {});
    const payload = parseJsonObject<UploadUndoPayload>(targetLog.before_data, { authors: [] });
    await withTransaction(async () => {
      for (const entry of payload.authors.filter((row) => row.action === "create").reverse()) {
        await clearAuthorAliases(entry.id, entry.internalId);
        await softDeleteAuthor(entry.internalId, currentUser.id);
      }
      for (const entry of payload.authors.filter((row) => row.action === "update").reverse()) {
        if (!entry.beforeRow) continue;
        await restoreAuthorSnapshot(entry.internalId, entry.beforeRow);
        await restoreAuthorAliases(entry.id, entry.internalId, entry.beforeAliases ?? []);
      }
      await queryRows(`
update public.user_logs
set undone_at = now()
where id = ${sqlString(String(targetLog.id))}::bigint;
`);
      await queryRows(`
insert into public.user_logs (
  user_id, actor_user_id, log_type, target_type, target_id, metadata, before_data, after_data, note, related_log_id
) values (
  ${sqlString(currentUser.id)}::uuid,
  ${sqlString(currentUser.id)}::uuid,
  'undo_applied',
  'author_csv_upload',
  ${sqlString(String(targetLog.target_id ?? ""))},
  ${sqlJson(metadata)},
  ${sqlString(targetLog.after_data ?? "{}")}::jsonb,
  ${sqlString(targetLog.before_data ?? "{}")}::jsonb,
  'undo_upload_apply',
  ${sqlString(String(targetLog.id))}::bigint
);
`);
    });
    return NextResponse.json({ label: String(metadata.label ?? "Undo Upload"), importedCount: Number(metadata.importedCount ?? 0) || 0 });
  } catch (error) {
    return createRouteErrorResponse(error, "failed to apply upload undo", {
      databaseMessage: "データベースに接続できないため著者CSV Undoを実行できません。",
    });
  }
}
