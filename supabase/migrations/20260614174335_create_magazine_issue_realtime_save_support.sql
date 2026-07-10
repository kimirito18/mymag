begin;

set local statement_timeout = '5min';

alter table public.magazine_issues
  add column if not exists issue_title_reading text not null default 'みていぎ',
  add column if not exists subtitle text not null default '',
  add column if not exists subtitle_reading text not null default 'みていぎ',
  add column if not exists release_year integer,
  add column if not exists release_month integer,
  add column if not exists release_day integer,
  add column if not exists display_year integer,
  add column if not exists display_month integer,
  add column if not exists display_day integer,
  add column if not exists display_combined_month integer,
  add column if not exists display_combined_day integer,
  add column if not exists publication_year integer,
  add column if not exists publication_month integer,
  add column if not exists publication_day integer,
  add column if not exists publication_combined_month integer,
  add column if not exists publication_combined_day integer,
  add column if not exists volume_issue_note text not null default '',
  add column if not exists publishers jsonb not null default '[]'::jsonb,
  add column if not exists publisher_person text not null default '',
  add column if not exists editor_person text not null default '',
  add column if not exists related_magazines jsonb not null default '[]'::jsonb,
  add column if not exists binding text not null default '',
  add column if not exists magazine_code text not null default '',
  add column if not exists category text[] not null default '{}',
  add column if not exists rating text not null default '',
  add column if not exists is_special_issue boolean not null default false,
  add column if not exists is_mitsumine boolean not null default false;

update public.magazine_issues
set
  release_year = coalesce(release_year, year),
  release_month = coalesce(release_month, month),
  release_day = coalesce(release_day, day)
where
  release_year is null
  or release_month is null
  or release_day is null;

update public.magazine_issues
set
  display_year = (regexp_match(issue_label, '([0-9]{4})年\s*([0-9]{1,2})月'))[1]::integer,
  display_month = (regexp_match(issue_label, '([0-9]{4})年\s*([0-9]{1,2})月'))[2]::integer,
  display_day = null
where issue_label ~ '[0-9]{4}年\s*[0-9]{1,2}月';

alter table public.magazine_issues
  drop constraint if exists magazine_issues_issue_title_reading_required,
  drop constraint if exists magazine_issues_subtitle_reading_required,
  drop constraint if exists magazine_issues_publishers_is_array,
  drop constraint if exists magazine_issues_related_magazines_is_array,
  drop constraint if exists magazine_issues_display_month_range,
  drop constraint if exists magazine_issues_display_day_range,
  drop constraint if exists magazine_issues_release_month_range,
  drop constraint if exists magazine_issues_release_day_range,
  drop constraint if exists magazine_issues_publication_month_range,
  drop constraint if exists magazine_issues_publication_day_range;

alter table public.magazine_issues
  add constraint magazine_issues_issue_title_reading_required
  check (btrim(issue_title_reading) <> ''),
  add constraint magazine_issues_subtitle_reading_required
  check (btrim(subtitle_reading) <> ''),
  add constraint magazine_issues_publishers_is_array
  check (jsonb_typeof(publishers) = 'array'),
  add constraint magazine_issues_related_magazines_is_array
  check (jsonb_typeof(related_magazines) = 'array'),
  add constraint magazine_issues_display_month_range
  check (display_month is null or display_month between 1 and 12),
  add constraint magazine_issues_display_day_range
  check (display_day is null or display_day between 1 and 31),
  add constraint magazine_issues_release_month_range
  check (release_month is null or release_month between 1 and 12),
  add constraint magazine_issues_release_day_range
  check (release_day is null or release_day between 1 and 31),
  add constraint magazine_issues_publication_month_range
  check (publication_month is null or publication_month between 1 and 12),
  add constraint magazine_issues_publication_day_range
  check (publication_day is null or publication_day between 1 and 31);

create table if not exists public.audit_logs (
  audit_log_id uuid primary key default gen_random_uuid(),
  action_type text not null,
  target_table text not null,
  target_id text not null,
  target_label text not null default '',
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  actor_role text not null default 'super_admin',
  actor_user_id uuid references auth.users(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),

  constraint audit_logs_action_type_required check (btrim(action_type) <> ''),
  constraint audit_logs_target_table_required check (btrim(target_table) <> ''),
  constraint audit_logs_target_id_required check (btrim(target_id) <> ''),
  constraint audit_logs_before_data_is_object check (jsonb_typeof(before_data) = 'object'),
  constraint audit_logs_after_data_is_object check (jsonb_typeof(after_data) = 'object')
);

create index if not exists audit_logs_target_idx
  on public.audit_logs (target_table, target_id, created_at desc);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "authenticated users can read audit logs" on public.audit_logs;

create policy "authenticated users can read audit logs"
on public.audit_logs
for select
to authenticated
using (true);

drop trigger if exists magazine_issues_bump_edit_version on public.magazine_issues;

create trigger magazine_issues_bump_edit_version
before update on public.magazine_issues
for each row
when (
  old.source_issue_key is distinct from new.source_issue_key
  or old.magazine_id is distinct from new.magazine_id
  or old.publisher_id is distinct from new.publisher_id
  or old.issue_title is distinct from new.issue_title
  or old.issue_title_reading is distinct from new.issue_title_reading
  or old.issue_label is distinct from new.issue_label
  or old.subtitle is distinct from new.subtitle
  or old.subtitle_reading is distinct from new.subtitle_reading
  or old.publication_frequency is distinct from new.publication_frequency
  or old.media_format is distinct from new.media_format
  or old.published_date is distinct from new.published_date
  or old.year is distinct from new.year
  or old.month is distinct from new.month
  or old.day is distinct from new.day
  or old.release_year is distinct from new.release_year
  or old.release_month is distinct from new.release_month
  or old.release_day is distinct from new.release_day
  or old.display_year is distinct from new.display_year
  or old.display_month is distinct from new.display_month
  or old.display_day is distinct from new.display_day
  or old.display_combined_month is distinct from new.display_combined_month
  or old.display_combined_day is distinct from new.display_combined_day
  or old.publication_year is distinct from new.publication_year
  or old.publication_month is distinct from new.publication_month
  or old.publication_day is distinct from new.publication_day
  or old.publication_combined_month is distinct from new.publication_combined_month
  or old.publication_combined_day is distinct from new.publication_combined_day
  or old.volume_number is distinct from new.volume_number
  or old.issue_number is distinct from new.issue_number
  or old.total_issue_number is distinct from new.total_issue_number
  or old.issue_number_displayed is distinct from new.issue_number_displayed
  or old.sub_issue_number is distinct from new.sub_issue_number
  or old.volume_issue_note is distinct from new.volume_issue_note
  or old.publisher_name is distinct from new.publisher_name
  or old.publishers is distinct from new.publishers
  or old.publisher_person is distinct from new.publisher_person
  or old.editor_person is distinct from new.editor_person
  or old.related_magazines is distinct from new.related_magazines
  or old.binding is distinct from new.binding
  or old.magazine_code is distinct from new.magazine_code
  or old.category is distinct from new.category
  or old.rating is distinct from new.rating
  or old.price is distinct from new.price
  or old.size is distinct from new.size
  or old.number_of_pages is distinct from new.number_of_pages
  or old.is_special_issue is distinct from new.is_special_issue
  or old.is_mitsumine is distinct from new.is_mitsumine
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

commit;
