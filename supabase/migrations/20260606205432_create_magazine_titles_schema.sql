create table if not exists public.magazine_titles (
  magazine_id text primary key,
  title text not null,
  title_reading text not null,
  title_variants jsonb not null default '[]'::jsonb,
  publisher_id text not null references public.publishers(publisher_id) on delete restrict,
  first_published_date date,
  closed_date date,
  publication_frequency jsonb not null default '[]'::jsonb,
  issn text not null default '',
  jpno text not null default '',
  note text not null default '',
  related_magazines jsonb not null default '[]'::jsonb,
  relation_note text not null default '',
  tags text[] not null default '{}',
  search_text text not null default '',
  search_reading text not null default '',
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

  constraint magazine_titles_magazine_id_format check (magazine_id ~ '^M[0-9]+$'),
  constraint magazine_titles_title_required check (btrim(title) <> ''),
  constraint magazine_titles_title_reading_required check (btrim(title_reading) <> ''),
  constraint magazine_titles_title_variants_is_array check (jsonb_typeof(title_variants) = 'array'),
  constraint magazine_titles_publication_frequency_is_array check (jsonb_typeof(publication_frequency) = 'array'),
  constraint magazine_titles_related_magazines_is_array check (jsonb_typeof(related_magazines) = 'array'),
  constraint magazine_titles_search_text_max_length check (char_length(search_text) <= 1000),
  constraint magazine_titles_search_reading_max_length check (char_length(search_reading) <= 1000),
  constraint magazine_titles_record_status_check check (record_status in ('draft', 'submitted', 'published', 'deleted')),
  constraint magazine_titles_edit_version_positive check (edit_version > 0),
  constraint magazine_titles_deleted_fields_check check (
    record_status <> 'deleted'
    or deleted_at is not null
  )
);

create trigger magazine_titles_set_updated_at
before update on public.magazine_titles
for each row
execute function public.set_updated_at();

create trigger magazine_titles_bump_edit_version
before update on public.magazine_titles
for each row
when (
  old.title is distinct from new.title
  or old.title_reading is distinct from new.title_reading
  or old.title_variants is distinct from new.title_variants
  or old.publisher_id is distinct from new.publisher_id
  or old.first_published_date is distinct from new.first_published_date
  or old.closed_date is distinct from new.closed_date
  or old.publication_frequency is distinct from new.publication_frequency
  or old.issn is distinct from new.issn
  or old.jpno is distinct from new.jpno
  or old.note is distinct from new.note
  or old.related_magazines is distinct from new.related_magazines
  or old.relation_note is distinct from new.relation_note
  or old.tags is distinct from new.tags
  or old.search_text is distinct from new.search_text
  or old.search_reading is distinct from new.search_reading
  or old.record_status is distinct from new.record_status
)
execute function public.bump_edit_version();

create index if not exists magazine_titles_title_reading_idx
  on public.magazine_titles (title_reading);

create index if not exists magazine_titles_publisher_id_idx
  on public.magazine_titles (publisher_id);

create index if not exists magazine_titles_record_status_owner_user_id_idx
  on public.magazine_titles (record_status, owner_user_id);

create index if not exists magazine_titles_updated_at_idx
  on public.magazine_titles (updated_at);

create index if not exists magazine_titles_tags_gin_idx
  on public.magazine_titles using gin (tags);

create index if not exists magazine_titles_title_variants_gin_idx
  on public.magazine_titles using gin (title_variants);

create index if not exists magazine_titles_search_text_trgm_idx
  on public.magazine_titles using gin (search_text gin_trgm_ops);

create index if not exists magazine_titles_search_reading_trgm_idx
  on public.magazine_titles using gin (search_reading gin_trgm_ops);

alter table public.magazine_titles enable row level security;

create policy "published magazine titles are readable"
on public.magazine_titles
for select
to anon, authenticated
using (record_status = 'published');

create policy "owners can read their magazine title drafts"
on public.magazine_titles
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owners can insert magazine title drafts"
on public.magazine_titles
for insert
to authenticated
with check (
  record_status = 'draft'
  and owner_user_id = auth.uid()
  and created_by = auth.uid()
);

create policy "owners can update magazine title drafts"
on public.magazine_titles
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
