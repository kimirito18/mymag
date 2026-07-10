insert into public.authors (
  author_id,
  author_name,
  author_reading,
  search_text,
  is_system_record,
  record_status
) values (
  'A000000',
  '著者不明',
  'ちょしゃふめい',
  'A000000 著者不明 ちょしゃふめい chosya fumei chosha fumei',
  true,
  'published'
)
on conflict (author_id) do update set
  author_name = excluded.author_name,
  author_reading = excluded.author_reading,
  search_text = excluded.search_text,
  is_system_record = excluded.is_system_record,
  record_status = excluded.record_status;

insert into public.publishers (
  publisher_id,
  publisher_name,
  publisher_reading,
  search_text,
  is_system_record,
  record_status
) values (
  'P000000',
  '出版社不明',
  'しゅっぱんしゃふめい',
  'P000000 出版社不明 しゅっぱんしゃふめい',
  true,
  'published'
)
on conflict (publisher_id) do update set
  publisher_name = excluded.publisher_name,
  publisher_reading = excluded.publisher_reading,
  search_text = excluded.search_text,
  is_system_record = excluded.is_system_record,
  record_status = excluded.record_status;

insert into public.magazine_titles (
  magazine_id,
  title,
  title_reading,
  title_variants,
  publisher_id,
  search_text,
  search_reading,
  is_system_record,
  record_status
) values (
  'M000000',
  '雑誌不明',
  'ざっしふめい',
  '[]'::jsonb,
  'P000000',
  'M000000 雑誌不明 ざっしふめい 出版社不明',
  'ざっしふめい',
  true,
  'published'
)
on conflict (magazine_id) do update set
  title = excluded.title,
  title_reading = excluded.title_reading,
  title_variants = excluded.title_variants,
  publisher_id = excluded.publisher_id,
  search_text = excluded.search_text,
  search_reading = excluded.search_reading,
  is_system_record = excluded.is_system_record,
  record_status = excluded.record_status;
