begin;

with admin_user as (
  select id
  from public.users
  where login_name = 'admin'
  limit 1
),
editor_user as (
  select id
  from public.users
  where login_name = 'editor-A'
  limit 1
)
insert into public.message_threads (
  message_thread_id,
  thread_type,
  title,
  visibility_scope,
  created_by_user_id,
  created_at,
  updated_at,
  last_message_at,
  last_message_preview,
  last_message_type,
  last_message_by_user_id
)
select
  '00000000-0000-4000-8000-000000000101'::uuid,
  'general',
  '入力作業の連絡',
  'all_members',
  admin_user.id,
  now() - interval '2 days',
  now() - interval '2 hours',
  now() - interval '2 hours',
  '関連誌の記入ルールは雑誌マスターと合わせます。',
  'text',
  editor_user.id
from admin_user, editor_user
on conflict (message_thread_id) do update
set
  title = excluded.title,
  updated_at = excluded.updated_at,
  last_message_at = excluded.last_message_at,
  last_message_preview = excluded.last_message_preview,
  last_message_type = excluded.last_message_type,
  last_message_by_user_id = excluded.last_message_by_user_id;

with admin_user as (
  select id
  from public.users
  where login_name = 'admin'
  limit 1
),
editor_user as (
  select id
  from public.users
  where login_name = 'editor-A'
  limit 1
)
insert into public.messages (
  message_id,
  message_thread_id,
  sender_user_id,
  message_type,
  body,
  created_at
)
select *
from (
  select
    '00000000-0000-4000-8000-000000001101'::uuid,
    '00000000-0000-4000-8000-000000000101'::uuid,
    admin_user.id,
    'text',
    '今週は関連誌と出版社の入力ルールを優先して進めます。',
    now() - interval '1 day'
  from admin_user

  union all

  select
    '00000000-0000-4000-8000-000000001102'::uuid,
    '00000000-0000-4000-8000-000000000101'::uuid,
    editor_user.id,
    'text',
    '関連誌の記入ルールは雑誌マスターと合わせます。',
    now() - interval '2 hours'
  from editor_user
) seeded
on conflict (message_id) do update
set
  body = excluded.body,
  created_at = excluded.created_at;

with admin_user as (
  select id
  from public.users
  where login_name = 'admin'
  limit 1
),
editor_user as (
  select id
  from public.users
  where login_name = 'editor-A'
  limit 1
),
application_thread as (
  select distinct on (message_thread_id)
    message_thread_id,
    application_group_id
  from public.application_requests
  where application_group_id = 'AR000001'
    and message_thread_id is not null
)
insert into public.messages (
  message_id,
  message_thread_id,
  sender_user_id,
  message_type,
  body,
  event_type,
  application_group_id,
  created_at
)
select *
from (
  select
    '00000000-0000-4000-8000-000000002101'::uuid,
    application_thread.message_thread_id,
    admin_user.id,
    'text',
    '読みはこのままで問題ありません。備考だけ補足をお願いします。',
    null::text,
    application_thread.application_group_id,
    now() - interval '90 minutes'
  from application_thread, admin_user

  union all

  select
    '00000000-0000-4000-8000-000000002102'::uuid,
    application_thread.message_thread_id,
    editor_user.id,
    'text',
    '了解しました。補足を入れてから再度確認します。',
    null::text,
    application_thread.application_group_id,
    now() - interval '70 minutes'
  from application_thread, editor_user
) seeded
on conflict (message_id) do update
set
  body = excluded.body,
  created_at = excluded.created_at;

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

commit;
