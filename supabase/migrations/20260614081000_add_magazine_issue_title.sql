begin;

set local statement_timeout = '5min';

alter table public.magazine_issues
  add column if not exists issue_title text not null default '';

update public.magazine_issues as mi
set
  issue_title = coalesce(nullif(mt.title, ''), mi.issue_label),
  updated_at = now()
from public.magazine_titles as mt
where mi.magazine_id = mt.magazine_id
  and btrim(mi.issue_title) = '';

alter table public.magazine_issues
  drop constraint if exists magazine_issues_issue_title_required;

alter table public.magazine_issues
  add constraint magazine_issues_issue_title_required
  check (btrim(issue_title) <> '');

drop trigger if exists magazine_issues_bump_edit_version on public.magazine_issues;

create trigger magazine_issues_bump_edit_version
before update on public.magazine_issues
for each row
when (
  old.source_issue_key is distinct from new.source_issue_key
  or old.magazine_id is distinct from new.magazine_id
  or old.publisher_id is distinct from new.publisher_id
  or old.issue_title is distinct from new.issue_title
  or old.issue_label is distinct from new.issue_label
  or old.publication_frequency is distinct from new.publication_frequency
  or old.media_format is distinct from new.media_format
  or old.published_date is distinct from new.published_date
  or old.year is distinct from new.year
  or old.month is distinct from new.month
  or old.day is distinct from new.day
  or old.volume_number is distinct from new.volume_number
  or old.issue_number is distinct from new.issue_number
  or old.total_issue_number is distinct from new.total_issue_number
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

commit;
