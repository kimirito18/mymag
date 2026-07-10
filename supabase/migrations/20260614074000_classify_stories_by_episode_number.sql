begin;

set local statement_timeout = '5min';

update public.stories
set
  story_type = case
    when btrim(episode_number) <> '' or episode_number_sort is not null then 'serial'
    else 'one_shot'
  end,
  updated_at = now()
where record_status = 'published'
  and status <> 'deleted'
  and story_type is distinct from case
    when btrim(episode_number) <> '' or episode_number_sort is not null then 'serial'
    else 'one_shot'
  end;

commit;
