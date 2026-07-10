create table if not exists public.magazine_issues (
  magazine_issue_id text primary key,
  source_issue_key text not null unique,
  magazine_id text not null references public.magazine_titles(magazine_id) on delete restrict,
  publisher_id text not null references public.publishers(publisher_id) on delete restrict,
  issue_label text not null,
  media_format text not null default 'unknown',
  published_date date,
  year integer,
  month integer,
  day integer,
  volume_number text not null default '',
  issue_number text not null default '',
  issue_number_displayed text not null default '',
  sub_issue_number text not null default '',
  publisher_name text not null default '',
  price text not null default '',
  size text not null default '',
  number_of_pages integer,
  contents jsonb not null default '[]'::jsonb,
  note text not null default '',
  source_work_count integer not null default 0,
  source_first_work_id text not null default '',
  tags text[] not null default '{}',
  search_text text not null default '',
  search_reading text not null default '',
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

  constraint magazine_issues_magazine_issue_id_format check (magazine_issue_id ~ '^MI[0-9]{7}$'),
  constraint magazine_issues_issue_label_required check (btrim(issue_label) <> ''),
  constraint magazine_issues_media_format_check check (media_format in ('print', 'digital', 'print_and_digital', 'unknown')),
  constraint magazine_issues_contents_is_array check (jsonb_typeof(contents) = 'array'),
  constraint magazine_issues_source_work_count_nonnegative check (source_work_count >= 0),
  constraint magazine_issues_number_of_pages_positive check (number_of_pages is null or number_of_pages > 0),
  constraint magazine_issues_search_text_max_length check (char_length(search_text) <= 1000),
  constraint magazine_issues_search_reading_max_length check (char_length(search_reading) <= 1000),
  constraint magazine_issues_record_status_check check (record_status in ('draft', 'submitted', 'published', 'deleted')),
  constraint magazine_issues_edit_version_positive check (edit_version > 0),
  constraint magazine_issues_deleted_fields_check check (
    record_status <> 'deleted'
    or deleted_at is not null
  )
);

create trigger magazine_issues_set_updated_at
before update on public.magazine_issues
for each row
execute function public.set_updated_at();

create trigger magazine_issues_bump_edit_version
before update on public.magazine_issues
for each row
when (
  old.source_issue_key is distinct from new.source_issue_key
  or old.magazine_id is distinct from new.magazine_id
  or old.publisher_id is distinct from new.publisher_id
  or old.issue_label is distinct from new.issue_label
  or old.media_format is distinct from new.media_format
  or old.published_date is distinct from new.published_date
  or old.year is distinct from new.year
  or old.month is distinct from new.month
  or old.day is distinct from new.day
  or old.volume_number is distinct from new.volume_number
  or old.issue_number is distinct from new.issue_number
  or old.issue_number_displayed is distinct from new.issue_number_displayed
  or old.sub_issue_number is distinct from new.sub_issue_number
  or old.publisher_name is distinct from new.publisher_name
  or old.price is distinct from new.price
  or old.size is distinct from new.size
  or old.number_of_pages is distinct from new.number_of_pages
  or old.contents is distinct from new.contents
  or old.note is distinct from new.note
  or old.source_work_count is distinct from new.source_work_count
  or old.source_first_work_id is distinct from new.source_first_work_id
  or old.tags is distinct from new.tags
  or old.search_text is distinct from new.search_text
  or old.search_reading is distinct from new.search_reading
  or old.record_status is distinct from new.record_status
)
execute function public.bump_edit_version();

create index if not exists magazine_issues_magazine_id_idx
  on public.magazine_issues (magazine_id);

create index if not exists magazine_issues_publisher_id_idx
  on public.magazine_issues (publisher_id);

create index if not exists magazine_issues_published_date_idx
  on public.magazine_issues (published_date);

create index if not exists magazine_issues_year_month_idx
  on public.magazine_issues (year, month);

create index if not exists magazine_issues_record_status_owner_user_id_idx
  on public.magazine_issues (record_status, owner_user_id);

create index if not exists magazine_issues_updated_at_idx
  on public.magazine_issues (updated_at);

create index if not exists magazine_issues_tags_gin_idx
  on public.magazine_issues using gin (tags);

create index if not exists magazine_issues_contents_gin_idx
  on public.magazine_issues using gin (contents);

create index if not exists magazine_issues_search_text_trgm_idx
  on public.magazine_issues using gin (search_text gin_trgm_ops);

create index if not exists magazine_issues_search_reading_trgm_idx
  on public.magazine_issues using gin (search_reading gin_trgm_ops);

alter table public.magazine_issues enable row level security;

create policy "published magazine issues are readable"
on public.magazine_issues
for select
to anon, authenticated
using (record_status = 'published');

create policy "owners can read their magazine issue drafts"
on public.magazine_issues
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owners can insert magazine issue drafts"
on public.magazine_issues
for insert
to authenticated
with check (
  record_status = 'draft'
  and owner_user_id = auth.uid()
  and created_by = auth.uid()
);

create policy "owners can update magazine issue drafts"
on public.magazine_issues
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

alter table public.stories
  add constraint stories_first_magazine_issue_id_fkey
  foreign key (first_magazine_issue_id)
  references public.magazine_issues(magazine_issue_id)
  on delete restrict;

create index if not exists stories_first_magazine_issue_id_idx
  on public.stories (first_magazine_issue_id);
