begin;

update public.magazine_issues
set magazine_id = 'M000131'
where magazine_id in ('M000164', 'M000166');

update public.magazine_titles
set
  note = '出版社変更: 辰巳出版 -> 富士美出版 -> スコラマガジン。雑誌マスターは同一誌として統合し、各号の出版社は magazine_issues.publisher_id で保持する。',
  search_text = 'M000131 COMICペンギンクラブ山賊版 こみっくぺんぎんくらぶさんぞくばん 辰巳出版 富士美出版 スコラマガジン',
  search_reading = 'こみっくぺんぎんくらぶさんぞくばん',
  record_status = 'published',
  deleted_at = null,
  delete_reason = null
where magazine_id = 'M000131';

update public.magazine_titles
set
  record_status = 'deleted',
  deleted_at = now(),
  delete_reason = 'COMICペンギンクラブ山賊版は出版社変更をまたぐ同一誌として M000131 に統合',
  search_text = search_text || ' 統合先 M000131',
  search_reading = coalesce(nullif(search_reading, ''), 'こみっくぺんぎんくらぶさんぞくばん')
where magazine_id in ('M000164', 'M000166');

commit;
