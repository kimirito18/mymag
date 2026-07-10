alter table public.stories
  drop constraint if exists stories_series_title_reading_required,
  drop constraint if exists stories_subtitle_reading_required;

alter table public.stories
  alter column series_title_reading set default '',
  alter column subtitle_reading set default '';

update public.stories
set series_title_reading = ''
where btrim(series_title) = '';

update public.stories
set subtitle_reading = ''
where btrim(subtitle) = '';
