update public.magazine_issues
set issue_number_displayed = total_issue_number
where total_issue_number <> ''
  and issue_number_displayed = '';
