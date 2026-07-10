alter table public.magazine_titles
  add column if not exists publishers jsonb not null default '[]'::jsonb;

update public.magazine_titles mt
set publishers = jsonb_build_array(
  jsonb_build_object(
    'role', '発行',
    'name', coalesce(p.publisher_name, '出版社不明'),
    'reading', coalesce(p.publisher_reading, 'しゅっぱんしゃふめい'),
    'publisher_key', mt.publisher_key,
    'publisher_id', mt.publisher_id
  )
)
from public.publishers p
where p.id = mt.publisher_key
  and (
    mt.publishers = '[]'::jsonb
    or mt.publishers is null
  );

alter table public.magazine_titles
  add constraint magazine_titles_publishers_is_array
    check (jsonb_typeof(publishers) = 'array');

drop trigger if exists magazine_titles_bump_edit_version on public.magazine_titles;

create trigger magazine_titles_bump_edit_version
before update on public.magazine_titles
for each row
when (
  old.title is distinct from new.title
  or old.title_reading is distinct from new.title_reading
  or old.title_variants is distinct from new.title_variants
  or old.publishers is distinct from new.publishers
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
