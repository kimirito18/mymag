alter table public.magazine_issues
  add column if not exists publisher_id text
  references public.publishers(publisher_id)
  on delete restrict;

update public.magazine_issues mi
set publisher_id = mt.publisher_id
from public.magazine_titles mt
where mt.magazine_id = mi.magazine_id
  and mi.publisher_id is null;

update public.magazine_issues
set publisher_id = 'P000000'
where publisher_id is null;

alter table public.magazine_issues
  alter column publisher_id set not null;

create index if not exists magazine_issues_publisher_id_idx
  on public.magazine_issues (publisher_id);
