create extension if not exists pg_trgm with schema extensions;

create table if not exists public.authors (
  author_id text primary key,
  author_name text not null,
  author_reading text not null,
  social_links jsonb not null default '[]'::jsonb,
  memo text not null default '',
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

  constraint authors_author_id_format check (author_id ~ '^A[0-9]+$'),
  constraint authors_author_name_required check (btrim(author_name) <> ''),
  constraint authors_author_reading_required check (btrim(author_reading) <> ''),
  constraint authors_social_links_is_array check (jsonb_typeof(social_links) = 'array'),
  constraint authors_search_text_max_length check (char_length(search_text) <= 1000),
  constraint authors_record_status_check check (record_status in ('draft', 'submitted', 'published', 'deleted')),
  constraint authors_edit_version_positive check (edit_version > 0),
  constraint authors_deleted_fields_check check (
    record_status <> 'deleted'
    or deleted_at is not null
  )
);

create table if not exists public.author_alias_links (
  author_id_1 text not null references public.authors(author_id) on delete restrict,
  author_id_2 text not null references public.authors(author_id) on delete restrict,
  relation_kind text not null default 'alias',
  memo text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (author_id_1, author_id_2),
  constraint author_alias_links_order_check check (author_id_1 < author_id_2),
  constraint author_alias_links_relation_kind_check check (relation_kind in ('alias'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bump_edit_version()
returns trigger
language plpgsql
as $$
begin
  new.edit_version = old.edit_version + 1;
  return new;
end;
$$;

create trigger authors_set_updated_at
before update on public.authors
for each row
execute function public.set_updated_at();

create trigger authors_bump_edit_version
before update on public.authors
for each row
when (
  old.author_name is distinct from new.author_name
  or old.author_reading is distinct from new.author_reading
  or old.social_links is distinct from new.social_links
  or old.memo is distinct from new.memo
  or old.tags is distinct from new.tags
  or old.search_text is distinct from new.search_text
  or old.record_status is distinct from new.record_status
)
execute function public.bump_edit_version();

create index if not exists authors_author_reading_idx
  on public.authors (author_reading);

create index if not exists authors_record_status_owner_user_id_idx
  on public.authors (record_status, owner_user_id);

create index if not exists authors_updated_at_idx
  on public.authors (updated_at);

create index if not exists authors_tags_gin_idx
  on public.authors using gin (tags);

create index if not exists authors_search_text_trgm_idx
  on public.authors using gin (search_text gin_trgm_ops);

create index if not exists author_alias_links_author_id_2_idx
  on public.author_alias_links (author_id_2);

alter table public.authors enable row level security;
alter table public.author_alias_links enable row level security;

create policy "published authors are readable"
on public.authors
for select
to anon, authenticated
using (record_status = 'published');

create policy "owners can read their author drafts"
on public.authors
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owners can insert author drafts"
on public.authors
for insert
to authenticated
with check (
  record_status = 'draft'
  and owner_user_id = auth.uid()
  and created_by = auth.uid()
);

create policy "owners can update author drafts"
on public.authors
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

create policy "published author alias links are readable"
on public.author_alias_links
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.authors author_1
    where author_1.author_id = author_alias_links.author_id_1
      and author_1.record_status = 'published'
  )
  and exists (
    select 1
    from public.authors author_2
    where author_2.author_id = author_alias_links.author_id_2
      and author_2.record_status = 'published'
  )
);
