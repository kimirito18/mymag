begin;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  login_name text not null unique,
  display_name text not null,
  email text,
  role text not null check (role in ('super_admin', 'expert', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended', 'deleted')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  ui_settings jsonb not null default '{}'::jsonb,
  workflow_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_settings_ui_settings_is_object check (jsonb_typeof(ui_settings) = 'object'),
  constraint user_settings_workflow_settings_is_object check (jsonb_typeof(workflow_settings) = 'object')
);

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row
execute function public.set_updated_at();

create table if not exists public.user_logs (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  log_type text not null,
  target_type text not null default '',
  target_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  note text not null default '',
  related_log_id bigint references public.user_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  constraint user_logs_log_type_required check (btrim(log_type) <> ''),
  constraint user_logs_metadata_is_object check (jsonb_typeof(metadata) = 'object'),
  constraint user_logs_before_data_is_object check (jsonb_typeof(before_data) = 'object'),
  constraint user_logs_after_data_is_object check (jsonb_typeof(after_data) = 'object')
);

create index if not exists user_logs_user_id_created_at_idx
  on public.user_logs (user_id, created_at desc);

create index if not exists user_logs_target_idx
  on public.user_logs (target_type, target_id, created_at desc);

create index if not exists user_logs_pending_undo_idx
  on public.user_logs (user_id, target_id, created_at desc)
  where log_type = 'undo_action' and undone_at is null;

insert into public.users (
  user_id,
  login_name,
  display_name,
  role,
  status,
  last_login_at
)
values (
  'U000001',
  'test_admin',
  'テスト管理者',
  'super_admin',
  'active',
  now()
)
on conflict (login_name) do update
set
  display_name = excluded.display_name,
  role = excluded.role,
  status = excluded.status,
  last_login_at = excluded.last_login_at;

insert into public.user_settings (
  user_id,
  ui_settings,
  workflow_settings
)
select
  users.id,
  jsonb_build_object('undo_stack_limit', 3),
  '{}'::jsonb
from public.users
where users.login_name = 'test_admin'
on conflict (user_id) do update
set
  ui_settings = public.user_settings.ui_settings || jsonb_build_object('undo_stack_limit', 3);

commit;
