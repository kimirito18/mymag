begin;

set local statement_timeout = '5min';

update public.magazine_issues
set
  magazine_id = 'M000147',
  updated_at = now()
where magazine_id = 'M000163'
  and record_status <> 'deleted';

update public.magazine_titles
set
  note = '出版社変更: 辰巳出版 -> 富士美出版。雑誌マスターは同一誌として統合し、各号の出版社は magazine_issues.publisher_id で保持する。',
  search_text = left(concat_ws(' ', magazine_id, title, title_reading, '辰巳出版', '富士美出版', '出版社変更: 辰巳出版 -> 富士美出版'), 1000),
  updated_at = now()
where magazine_id = 'M000147'
  and record_status <> 'deleted';

update public.magazine_titles
set
  record_status = 'deleted',
  deleted_at = now(),
  delete_reason = 'COMICペンギンセレブの出版社変更による重複マスターをM000147へ統合',
  updated_at = now()
where magazine_id = 'M000163';

commit;
