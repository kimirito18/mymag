create table if not exists public.publishers (
  publisher_id text primary key,
  publisher_name text not null,
  publisher_reading text not null,
  address text not null default '',
  url text not null default '',
  related_link jsonb not null default '[]'::jsonb,
  start_date date,
  end_date date,
  memo text not null default '',
  related_publishers jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  search_text text not null default '',
  is_system_record boolean not null default false,
  edit_version integer not null default 1,

  record_status text not null default 'draft',
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  deleted_at timestamptz,
  delete_reason text,

  constraint publishers_publisher_id_format check (publisher_id ~ '^P[0-9]+$'),
  constraint publishers_publisher_name_required check (btrim(publisher_name) <> ''),
  constraint publishers_publisher_reading_required check (btrim(publisher_reading) <> ''),
  constraint publishers_related_link_is_array check (jsonb_typeof(related_link) = 'array'),
  constraint publishers_related_publishers_is_array check (jsonb_typeof(related_publishers) = 'array'),
  constraint publishers_search_text_max_length check (char_length(search_text) <= 1000),
  constraint publishers_record_status_check check (record_status in ('draft', 'submitted', 'published', 'deleted')),
  constraint publishers_edit_version_positive check (edit_version > 0),
  constraint publishers_deleted_fields_check check (
    record_status <> 'deleted'
    or deleted_at is not null
  )
);

create trigger publishers_set_updated_at
before update on public.publishers
for each row
execute function public.set_updated_at();

create trigger publishers_bump_edit_version
before update on public.publishers
for each row
when (
  old.publisher_name is distinct from new.publisher_name
  or old.publisher_reading is distinct from new.publisher_reading
  or old.address is distinct from new.address
  or old.url is distinct from new.url
  or old.related_link is distinct from new.related_link
  or old.start_date is distinct from new.start_date
  or old.end_date is distinct from new.end_date
  or old.memo is distinct from new.memo
  or old.related_publishers is distinct from new.related_publishers
  or old.tags is distinct from new.tags
  or old.search_text is distinct from new.search_text
  or old.record_status is distinct from new.record_status
)
execute function public.bump_edit_version();

create index if not exists publishers_publisher_reading_idx
  on public.publishers (publisher_reading);

create index if not exists publishers_record_status_owner_user_id_idx
  on public.publishers (record_status, owner_user_id);

create index if not exists publishers_updated_at_idx
  on public.publishers (updated_at);

create index if not exists publishers_tags_gin_idx
  on public.publishers using gin (tags);

create index if not exists publishers_search_text_trgm_idx
  on public.publishers using gin (search_text extensions.gin_trgm_ops);

alter table public.publishers enable row level security;

create policy "published publishers are readable"
on public.publishers
for select
to anon, authenticated
using (record_status = 'published');

create policy "owners can read their publisher drafts"
on public.publishers
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owners can insert publisher drafts"
on public.publishers
for insert
to authenticated
with check (
  record_status = 'draft'
  and owner_user_id = auth.uid()
  and created_by = auth.uid()
);

create policy "owners can update publisher drafts"
on public.publishers
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and record_status = 'draft'
)
with check (
  owner_user_id = auth.uid()
  and record_status = 'draft'
);
