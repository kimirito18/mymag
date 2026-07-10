alter table public.application_requests
  add column if not exists application_group_id text,
  add column if not exists message_thread_id uuid references public.message_threads(message_thread_id) on delete set null;

update public.application_requests
set application_group_id = coalesce(
  nullif(application_group_id, ''),
  nullif(metadata->>'dependencyGroupId', ''),
  request_id
)
where coalesce(application_group_id, '') = '';

with grouped as (
  select distinct on (ar.application_group_id)
    ar.application_group_id,
    coalesce(nullif(ar.metadata->>'dependencyGroupLabel', ''), nullif(ar.parent_label, ''), nullif(ar.title, ''), ar.application_group_id) as thread_title,
    ar.requested_by_user_id,
    coalesce(ar.submitted_at, ar.reviewed_at, ar.updated_at, ar.created_at, now()) as thread_time
  from public.application_requests ar
  where ar.application_group_id is not null
    and ar.status <> 'draft'
  order by ar.application_group_id, coalesce(ar.submitted_at, ar.reviewed_at, ar.updated_at, ar.created_at, now()) asc
)
insert into public.message_threads (
  thread_type,
  title,
  visibility_scope,
  application_group_id,
  created_by_user_id,
  created_at,
  updated_at,
  last_message_at,
  last_message_preview,
  last_message_type
)
select
  'application',
  left(grouped.thread_title, 200),
  'all_members',
  grouped.application_group_id,
  grouped.requested_by_user_id,
  grouped.thread_time,
  grouped.thread_time,
  grouped.thread_time,
  '',
  'system'
from grouped
where not exists (
  select 1
  from public.message_threads existing
  where existing.thread_type = 'application'
    and existing.application_group_id = grouped.application_group_id
);

with grouped as (
  select distinct on (ar.application_group_id)
    ar.application_group_id,
    coalesce(nullif(ar.metadata->>'dependencyGroupLabel', ''), nullif(ar.parent_label, ''), nullif(ar.title, ''), ar.application_group_id) as thread_title,
    coalesce(ar.submitted_at, ar.reviewed_at, ar.updated_at, ar.created_at, now()) as thread_time
  from public.application_requests ar
  where ar.application_group_id is not null
    and ar.status <> 'draft'
  order by ar.application_group_id, coalesce(ar.submitted_at, ar.reviewed_at, ar.updated_at, ar.created_at, now()) asc
)
update public.message_threads mt
set
  title = grouped.thread_title,
  updated_at = greatest(mt.updated_at, grouped.thread_time)
from grouped
where mt.thread_type = 'application'
  and mt.application_group_id = grouped.application_group_id;

update public.application_requests ar
set
  message_thread_id = mt.message_thread_id
from public.message_threads mt
where mt.thread_type = 'application'
  and mt.application_group_id = ar.application_group_id
  and (ar.message_thread_id is null or ar.message_thread_id <> mt.message_thread_id);

with first_rows as (
  select distinct on (ar.application_group_id)
    ar.application_group_id,
    ar.message_thread_id,
    ar.request_id,
    ar.requested_by_user_id,
    coalesce(nullif(u.display_name, ''), nullif(u.login_name, ''), 'editor') as requester_name,
    ar.title,
    coalesce(ar.submitted_at, ar.updated_at, ar.created_at, now()) as event_time
  from public.application_requests ar
  left join public.users u
    on u.id = ar.requested_by_user_id
  where ar.application_group_id is not null
    and ar.message_thread_id is not null
    and ar.status <> 'draft'
  order by ar.application_group_id, coalesce(ar.submitted_at, ar.updated_at, ar.created_at, now()) asc
)
insert into public.messages (
  message_thread_id,
  sender_user_id,
  message_type,
  body,
  event_type,
  application_request_id,
  application_group_id,
  created_at
)
select
  fr.message_thread_id,
  fr.requested_by_user_id,
  'system',
  fr.requester_name || ' が ' || fr.title || ' を申請しました。',
  'application_submitted',
  fr.request_id,
  fr.application_group_id,
  fr.event_time
from first_rows fr
where not exists (
  select 1
  from public.messages m
  where m.message_thread_id = fr.message_thread_id
);

update public.message_threads mt
set
  last_message_at = last_rows.created_at,
  last_message_preview = left(last_rows.body, 120),
  last_message_type = last_rows.message_type,
  last_message_by_user_id = last_rows.sender_user_id,
  updated_at = greatest(mt.updated_at, last_rows.created_at)
from (
  select distinct on (m.message_thread_id)
    m.message_thread_id,
    m.created_at,
    m.body,
    m.message_type,
    m.sender_user_id
  from public.messages m
  order by m.message_thread_id, m.created_at desc, m.message_id desc
) last_rows
where mt.message_thread_id = last_rows.message_thread_id;
