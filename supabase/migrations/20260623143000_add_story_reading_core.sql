alter table public.stories
  add column if not exists title_reading_core text not null default '';

update public.stories
set title_reading_core = regexp_replace(
  coalesce(
    nullif(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(title_reading, ''), '(だい[ぁ-ゖー]+わ)(ぜんぺん|こうへん|ちゅうへん)?$', '', 'g'),
          '(ぜんぺん|こうへん|ちゅうへん|じょう|げ)$', '', 'g'
        ),
        '\s+', '', 'g'
      ),
      ''
    ),
    regexp_replace(coalesce(title_reading, ''), '\s+', '', 'g')
  ),
  '\s+', '', 'g'
)
where coalesce(title_reading_core, '') = '';

alter table public.stories
  add constraint stories_title_reading_core_required
  check (btrim(title_reading_core) <> '');

create index if not exists stories_title_reading_core_idx
  on public.stories (title_reading_core);

create index if not exists stories_title_reading_core_trgm_idx
  on public.stories using gin (title_reading_core gin_trgm_ops);
