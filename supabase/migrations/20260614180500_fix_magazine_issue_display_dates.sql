begin;

set local statement_timeout = '5min';

update public.magazine_issues
set
  display_year = (regexp_match(issue_label, '([0-9]{4})年\s*([0-9]{1,2})月'))[1]::integer,
  display_month = (regexp_match(issue_label, '([0-9]{4})年\s*([0-9]{1,2})月'))[2]::integer,
  display_day = null
where issue_label ~ '[0-9]{4}年\s*[0-9]{1,2}月';

update public.magazine_issues
set
  issue_title = 'COMIC快楽天',
  display_year = 2022,
  display_month = 9,
  display_day = null,
  issue_label = 'COMIC快楽天(2022年09月号) 325号 Vol.325'
where magazine_issue_id = 'MI0001904';

commit;
