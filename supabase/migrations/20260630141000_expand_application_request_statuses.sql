begin;

alter table public.application_requests
  drop constraint if exists application_requests_status_check;

alter table public.application_requests
  add constraint application_requests_status_check
  check (status in ('draft', 'submitted', 'on_hold', 'approved', 'rejected', 'invalidated', 'cancelled'));

commit;
