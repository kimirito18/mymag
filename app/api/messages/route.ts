import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { queryRows } from "@/app/lib/server-postgres";
import type { CurrentUserContext } from "@/app/lib/server-current-user";
import type { MessageEntryRecord, MessageThreadListResponse, MessageThreadRecord, MessageThreadType } from "@/app/lib/message-threads";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";

export const runtime = "nodejs";

type MessageMutationBody = {
  operation?: unknown;
  title?: unknown;
  body?: unknown;
  threadId?: unknown;
  lastMessageId?: unknown;
  threadType?: unknown;
  isClosed?: unknown;
};

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const normalizeText = (value: unknown) => String(value ?? "").trim();

const ensureMessageAccess = (currentUser: CurrentUserContext) => {
  if (currentUser.role === "viewer") {
    throw new Error("forbidden");
  }
};

const canManageThread = (
  currentUser: CurrentUserContext,
  threadType: string,
  createdByUserId: string,
) => {
  if (threadType === "application") {
    return currentUser.role === "super_admin";
  }
  return currentUser.role === "super_admin" || createdByUserId === currentUser.id;
};

const appendThreadMessage = async ({
  threadId,
  senderUserId,
  messageType,
  body,
  eventType,
}: {
  threadId: string;
  senderUserId?: string;
  messageType: "text" | "system";
  body: string;
  eventType?: string;
}) => {
  if (!threadId || !body.trim()) return "";
  const messageRows = await queryRows(`
insert into public.messages (
  message_thread_id,
  sender_user_id,
  message_type,
  body,
  event_type
) values (
  ${sqlString(threadId)}::uuid,
  ${senderUserId ? `${sqlString(senderUserId)}::uuid` : "null"},
  ${sqlString(messageType)},
  ${sqlString(body)},
  ${eventType ? sqlString(eventType) : "null"}
)
returning
  message_id::text as id,
  coalesce(created_at::text, now()::text) as created_at;
`);
  const messageId = messageRows[0]?.id ?? "";
  const createdAt = messageRows[0]?.created_at ?? "";
  await queryRows(`
update public.message_threads
set
  updated_at = now(),
  last_message_at = ${createdAt ? `${sqlString(createdAt)}::timestamptz` : "now()"},
  last_message_preview = ${sqlString(body.slice(0, 120))},
  last_message_type = ${sqlString(messageType)},
  last_message_by_user_id = ${senderUserId ? `${sqlString(senderUserId)}::uuid` : "null"}
where message_thread_id = ${sqlString(threadId)}::uuid;
`);
  return messageId;
};

const mapMessageRows = (rows: Record<string, string | null>[]): MessageEntryRecord[] => rows.map((row) => ({
  id: row.id ?? "",
  type: (row.message_type === "system" ? "system" : "text"),
  authorLoginName: row.author_login_name ?? "system",
  authorDisplayName: row.author_display_name ?? row.author_login_name ?? "system",
  body: row.body ?? "",
  time: row.created_at ?? "",
  eventType: row.event_type ?? "",
}));

const loadThreads = async (currentUser: CurrentUserContext, threadType: MessageThreadType): Promise<MessageThreadRecord[]> => {
  const threadRows = await queryRows(`
select
  mt.message_thread_id::text as id,
  mt.thread_type,
  mt.title,
  coalesce(mt.created_by_user_id::text, '') as created_by_user_id,
  coalesce(mt.updated_at::text, mt.created_at::text, '') as updated_at,
  coalesce(mt.last_message_at::text, mt.updated_at::text, mt.created_at::text, '') as last_message_at,
  coalesce(mt.last_message_preview, '') as last_message_preview,
  coalesce(mt.is_closed::text, 'false') as is_closed,
  coalesce(unread.unread_count, 0)::text as unread_count,
  coalesce(meta.subtitle, case when mt.thread_type = 'application' then '申請スレッド' else '全体共有スレッド' end) as subtitle
from public.message_threads mt
left join lateral (
  select
    case
      when mt.thread_type = 'application'
        then concat(
          coalesce(max(requester.login_name), '申請者未設定'),
          ' / ',
          count(ar.request_id)::text,
          '件'
        )
      else '全体共有スレッド'
    end as subtitle
  from public.application_requests ar
  left join public.users requester
    on requester.id = ar.requested_by_user_id
  where ar.application_group_id = mt.application_group_id
) meta on true
left join lateral (
  select count(*)::integer as unread_count
  from public.messages m
  left join public.message_reads mr
    on mr.message_thread_id = mt.message_thread_id
   and mr.user_id = ${sqlString(currentUser.id)}::uuid
  where m.message_thread_id = mt.message_thread_id
    and (mr.last_read_at is null or m.created_at > mr.last_read_at)
    and coalesce(m.sender_user_id::text, '') <> ${sqlString(currentUser.id)}
) unread on true
where mt.thread_type = ${sqlString(threadType)}
order by coalesce(mt.last_message_at, mt.updated_at, mt.created_at) desc, mt.created_at desc;
`);

  if (threadRows.length === 0) return [];

  const threadIds = threadRows.map((row) => row.id ?? "").filter(Boolean);
  const messageRows = await queryRows(`
select
  m.message_id::text as id,
  m.message_thread_id::text as thread_id,
  m.message_type,
  coalesce(nullif(u.login_name, ''), 'system') as author_login_name,
  coalesce(nullif(u.display_name, ''), nullif(u.login_name, ''), 'system') as author_display_name,
  coalesce(m.body, '') as body,
  coalesce(m.event_type, '') as event_type,
  coalesce(m.created_at::text, '') as created_at
from public.messages m
left join public.users u
  on u.id = m.sender_user_id
where m.message_thread_id in (${threadIds.map(sqlString).map((value) => `${value}::uuid`).join(", ")})
order by m.created_at asc, m.message_id asc;
`);

  const messagesByThreadId = new Map<string, MessageEntryRecord[]>();
  for (const row of messageRows) {
    const threadId = row.thread_id ?? "";
    const current = messagesByThreadId.get(threadId) ?? [];
    current.push(mapMessageRows([row])[0]);
    messagesByThreadId.set(threadId, current);
  }

  return threadRows.map((row) => ({
    id: row.id ?? "",
    kind: (row.thread_type === "application" ? "application" : "general") as MessageThreadType,
    title: row.title ?? "",
    subtitle: row.subtitle ?? "",
    updatedAt: row.last_message_at ?? row.updated_at ?? "",
    unreadCount: Number(row.unread_count ?? "0") || 0,
    isClosed: row.is_closed === "true",
    canManage: canManageThread(currentUser, row.thread_type ?? "", row.created_by_user_id ?? ""),
    lastMessagePreview: row.last_message_preview ?? "",
    messages: messagesByThreadId.get(row.id ?? "") ?? [],
  }));
};

const markThreadRead = async (currentUser: CurrentUserContext, threadId: string, lastMessageId: string) => {
  const latestRows = await queryRows(`
select
  m.message_id::text as message_id,
  coalesce(m.created_at::text, now()::text) as created_at
from public.messages m
where m.message_thread_id = ${sqlString(threadId)}::uuid
  ${lastMessageId ? `and m.message_id = ${sqlString(lastMessageId)}::uuid` : ""}
order by m.created_at desc, m.message_id desc
limit 1;
`);
  const latestRow = latestRows[0];
  if (!latestRow?.message_id) return;

  await queryRows(`
insert into public.message_reads (
  message_thread_id,
  user_id,
  last_read_message_id,
  last_read_at
) values (
  ${sqlString(threadId)}::uuid,
  ${sqlString(currentUser.id)}::uuid,
  ${sqlString(latestRow.message_id)}::uuid,
  ${sqlString(latestRow.created_at ?? "")}::timestamptz
)
on conflict (message_thread_id, user_id) do update
set
  last_read_message_id = excluded.last_read_message_id,
  last_read_at = excluded.last_read_at,
  updated_at = now();
`);
};

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    ensureMessageAccess(currentUser);
    const threadType = (normalizeText(request.nextUrl.searchParams.get("threadType")) || "general") as MessageThreadType;
    const threads = threadType === "application" || threadType === "general"
      ? await loadThreads(currentUser, threadType)
      : [];
    return NextResponse.json({ threads } satisfies MessageThreadListResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load messages";
    if (message === "forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return createRouteErrorResponse(error, "failed to load messages", {
      databaseMessage: "データベースに接続できないためメッセージを読み込めません。",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    ensureMessageAccess(currentUser);

    const body = await request.json().catch(() => ({})) as MessageMutationBody;
    const operation = normalizeText(body.operation);

    if (operation === "create_thread") {
      const title = normalizeText(body.title);
      const messageBody = normalizeText(body.body);
      if (!title || !messageBody) {
        return NextResponse.json({ error: "title and body are required" }, { status: 400 });
      }

      const threadRows = await queryRows(`
insert into public.message_threads (
  thread_type,
  title,
  visibility_scope,
  created_by_user_id
) values (
  'general',
  ${sqlString(title)},
  'all_members',
  ${sqlString(currentUser.id)}::uuid
)
returning message_thread_id::text as id;
`);
      const threadId = threadRows[0]?.id ?? "";
      if (!threadId) {
        return NextResponse.json({ error: "failed to create thread" }, { status: 500 });
      }

      const messageId = await appendThreadMessage({
        threadId,
        senderUserId: currentUser.id,
        messageType: "text",
        body: messageBody,
      });
      await markThreadRead(currentUser, threadId, messageId);

      return NextResponse.json({
        threads: await loadThreads(currentUser, "general"),
      } satisfies MessageThreadListResponse);
    }

    if (operation === "post_message") {
      const threadId = normalizeText(body.threadId);
      const messageBody = normalizeText(body.body);
      const requestedThreadType = normalizeText(body.threadType);
      if (!threadId || !messageBody) {
        return NextResponse.json({ error: "threadId and body are required" }, { status: 400 });
      }

      const threadRows = await queryRows(`
select
  message_thread_id::text as id,
  thread_type,
  coalesce(created_by_user_id::text, '') as created_by_user_id,
  coalesce(is_closed::text, 'false') as is_closed
from public.message_threads
where message_thread_id = ${sqlString(threadId)}::uuid
limit 1;
`);
      const threadRow = threadRows[0];
      if (!threadRow?.id) {
        return NextResponse.json({ error: "thread not found" }, { status: 404 });
      }
      if (threadRow.is_closed === "true") {
        return NextResponse.json({ error: "thread is closed" }, { status: 400 });
      }
      if (requestedThreadType && threadRow.thread_type !== requestedThreadType) {
        return NextResponse.json({ error: "thread type mismatch" }, { status: 400 });
      }

      const messageId = await appendThreadMessage({
        threadId,
        senderUserId: currentUser.id,
        messageType: "text",
        body: messageBody,
      });
      await markThreadRead(currentUser, threadId, messageId);

      return NextResponse.json({
        threads: await loadThreads(currentUser, (threadRow.thread_type === "application" ? "application" : "general") as MessageThreadType),
      } satisfies MessageThreadListResponse);
    }

    if (operation === "toggle_thread_closed") {
      const threadId = normalizeText(body.threadId);
      const nextIsClosed = body.isClosed === true;
      if (!threadId) {
        return NextResponse.json({ error: "threadId is required" }, { status: 400 });
      }

      const threadRows = await queryRows(`
select
  message_thread_id::text as id,
  thread_type,
  title,
  coalesce(created_by_user_id::text, '') as created_by_user_id,
  coalesce(is_closed::text, 'false') as is_closed
from public.message_threads
where message_thread_id = ${sqlString(threadId)}::uuid
limit 1;
`);
      const threadRow = threadRows[0];
      if (!threadRow?.id) {
        return NextResponse.json({ error: "thread not found" }, { status: 404 });
      }
      if (!canManageThread(currentUser, threadRow.thread_type ?? "", threadRow.created_by_user_id ?? "")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      if ((threadRow.is_closed === "true") === nextIsClosed) {
        return NextResponse.json({
          threads: await loadThreads(currentUser, (threadRow.thread_type === "application" ? "application" : "general") as MessageThreadType),
        } satisfies MessageThreadListResponse);
      }

      await queryRows(`
update public.message_threads
set
  is_closed = ${nextIsClosed ? "true" : "false"},
  updated_at = now()
where message_thread_id = ${sqlString(threadId)}::uuid;
`);

      await appendThreadMessage({
        threadId,
        senderUserId: currentUser.id,
        messageType: "system",
        body: nextIsClosed
          ? `${currentUser.loginName} がこのスレッドをクローズしました。`
          : `${currentUser.loginName} がこのスレッドを再開しました。`,
        eventType: nextIsClosed ? "thread_closed" : "thread_reopened",
      });

      return NextResponse.json({
        threads: await loadThreads(currentUser, (threadRow.thread_type === "application" ? "application" : "general") as MessageThreadType),
      } satisfies MessageThreadListResponse);
    }

    if (operation === "mark_read") {
      const threadId = normalizeText(body.threadId);
      const lastMessageId = normalizeText(body.lastMessageId);
      if (!threadId) {
        return NextResponse.json({ error: "threadId is required" }, { status: 400 });
      }
      await markThreadRead(currentUser, threadId, lastMessageId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid operation" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to update messages";
    if (message === "forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return createRouteErrorResponse(error, "failed to update messages", {
      databaseMessage: "データベースに接続できないためメッセージを更新できません。",
    });
  }
}
