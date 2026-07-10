update public.magazine_titles
set publisher_id = 'P000000'
where publisher_id is null;

alter table public.magazine_titles
  alter column publisher_id set not null;
