begin;

alter table public.users
add column if not exists login_password text not null default 'guest';

update public.users
set
  user_id = 'U000001',
  login_name = 'admin',
  display_name = '超管理人',
  role = 'super_admin',
  status = 'active',
  login_password = 'guest',
  updated_at = now()
where login_name = 'test_admin';

insert into public.users (
  user_id,
  login_name,
  display_name,
  role,
  status,
  login_password
)
values
  ('U000001', 'admin', '超管理人', 'super_admin', 'active', 'guest'),
  ('U000002', 'editor-A', '編集者A', 'expert', 'active', 'guest'),
  ('U000003', 'editor-B', '編集者B', 'expert', 'active', 'guest'),
  ('U000004', 'viewer-C', '回覧者C', 'viewer', 'active', 'guest'),
  ('U000005', 'viewer-D', '回覧者D', 'viewer', 'active', 'guest')
on conflict (login_name) do update
set
  user_id = excluded.user_id,
  display_name = excluded.display_name,
  role = excluded.role,
  status = excluded.status,
  login_password = excluded.login_password,
  updated_at = now();

insert into public.user_settings (
  user_id,
  ui_settings,
  workflow_settings
)
select
  u.id,
  jsonb_build_object(
    'undo_stack_limit', 3,
    'history_max_items', 20
  ),
  '{}'::jsonb
from public.users u
where u.login_name in ('admin', 'editor-A', 'editor-B', 'viewer-C', 'viewer-D')
on conflict (user_id) do update
set
  ui_settings = coalesce(public.user_settings.ui_settings, '{}'::jsonb)
    || jsonb_build_object('undo_stack_limit', 3, 'history_max_items', 20),
  updated_at = now();

commit;
