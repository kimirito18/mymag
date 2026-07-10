begin;

create table if not exists public.work_histories (
  work_history_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  context text not null,
  target_type text not null,
  target_id text not null,
  target_label text not null default '',
  parent_type text,
  parent_id text,
  parent_label text,
  last_action text not null default '',
  work_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  last_worked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_histories_context_required check (btrim(context) <> ''),
  constraint work_histories_target_type_required check (btrim(target_type) <> ''),
  constraint work_histories_target_id_required check (btrim(target_id) <> ''),
  constraint work_histories_last_action_required check (btrim(last_action) <> ''),
  constraint work_histories_metadata_is_object check (jsonb_typeof(metadata) = 'object'),
  constraint work_histories_unique_target unique (user_id, context, target_type, target_id)
);

create trigger work_histories_set_updated_at
before update on public.work_histories
for each row
execute function public.set_updated_at();

create index if not exists work_histories_user_context_worked_at_idx
  on public.work_histories (user_id, context, last_worked_at desc);

create index if not exists work_histories_target_idx
  on public.work_histories (target_type, target_id);

commit;
