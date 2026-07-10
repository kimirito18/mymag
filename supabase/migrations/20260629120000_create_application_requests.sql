begin;

create table if not exists public.application_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  entity_type text not null check (entity_type in ('author', 'publisher', 'magazine_title', 'magazine_issue_set')),
  entity_id text not null default '',
  title text not null,
  parent_label text not null default '',
  action text not null check (action in ('create', 'update', 'delete')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  route_path text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid not null references public.users(id) on delete cascade,
  reviewer_user_id uuid references public.users(id) on delete set null,
  reviewer_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  constraint application_requests_title_required check (btrim(title) <> ''),
  constraint application_requests_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create trigger application_requests_set_updated_at
before update on public.application_requests
for each row
execute function public.set_updated_at();

create index if not exists application_requests_requested_by_status_idx
  on public.application_requests (requested_by_user_id, status, updated_at desc);

create index if not exists application_requests_entity_idx
  on public.application_requests (entity_type, entity_id, updated_at desc);

commit;
