create table if not exists public.stories (
  story_id text primary key,
  story_type text not null default 'unknown',
  series_title text not null default '',
  series_title_reading text not null default 'みていぎ',
  episode_number text not null default '',
  episode_number_sort numeric,
  title text not null,
  title_reading text not null default 'みていぎ',
  subtitle text not null default '',
  subtitle_reading text not null default 'みていぎ',
  contributors jsonb not null default '[]'::jsonb,
  page_count integer,
  is_first_episode boolean not null default false,
  is_final_episode boolean not null default false,
  first_published_date date,
  first_magazine_issue_id text,
  status text not null default 'active',
  merged_into_story_id text references public.stories(story_id) on delete restrict,
  color_info text not null default '',
  memo text not null default '',
  tags text[] not null default '{}',
  source_work_ids jsonb not null default '[]'::jsonb,
  source_occurrences jsonb not null default '[]'::jsonb,
  search_text text not null default '',
  search_reading text not null default '',
  edit_version integer not null default 1,

  record_status text not null default 'draft',
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  deleted_at timestamptz,
  delete_reason text,

  constraint stories_story_id_format check (story_id ~ '^S[0-9]{7}$'),
  constraint stories_title_required check (btrim(title) <> ''),
  constraint stories_title_reading_required check (btrim(title_reading) <> ''),
  constraint stories_series_title_reading_required check (btrim(series_title_reading) <> ''),
  constraint stories_subtitle_reading_required check (btrim(subtitle_reading) <> ''),
  constraint stories_story_type_check check (story_type in ('serial', 'one_shot', 'extra', 'side_story', 'unknown')),
  constraint stories_status_check check (status in ('active', 'draft', 'merged', 'deleted')),
  constraint stories_record_status_check check (record_status in ('draft', 'submitted', 'published', 'deleted')),
  constraint stories_contributors_is_array check (jsonb_typeof(contributors) = 'array'),
  constraint stories_source_work_ids_is_array check (jsonb_typeof(source_work_ids) = 'array'),
  constraint stories_source_occurrences_is_array check (jsonb_typeof(source_occurrences) = 'array'),
  constraint stories_page_count_positive check (page_count is null or page_count > 0),
  constraint stories_search_text_max_length check (char_length(search_text) <= 1000),
  constraint stories_search_reading_max_length check (char_length(search_reading) <= 1000),
  constraint stories_edit_version_positive check (edit_version > 0),
  constraint stories_merged_target_required check (
    status <> 'merged'
    or merged_into_story_id is not null
  ),
  constraint stories_deleted_fields_check check (
    record_status <> 'deleted'
    or deleted_at is not null
  )
);

create trigger stories_set_updated_at
before update on public.stories
for each row
execute function public.set_updated_at();

create trigger stories_bump_edit_version
before update on public.stories
for each row
when (
  old.story_type is distinct from new.story_type
  or old.series_title is distinct from new.series_title
  or old.series_title_reading is distinct from new.series_title_reading
  or old.episode_number is distinct from new.episode_number
  or old.episode_number_sort is distinct from new.episode_number_sort
  or old.title is distinct from new.title
  or old.title_reading is distinct from new.title_reading
  or old.subtitle is distinct from new.subtitle
  or old.subtitle_reading is distinct from new.subtitle_reading
  or old.contributors is distinct from new.contributors
  or old.page_count is distinct from new.page_count
  or old.is_first_episode is distinct from new.is_first_episode
  or old.is_final_episode is distinct from new.is_final_episode
  or old.first_published_date is distinct from new.first_published_date
  or old.first_magazine_issue_id is distinct from new.first_magazine_issue_id
  or old.status is distinct from new.status
  or old.merged_into_story_id is distinct from new.merged_into_story_id
  or old.color_info is distinct from new.color_info
  or old.memo is distinct from new.memo
  or old.tags is distinct from new.tags
  or old.source_work_ids is distinct from new.source_work_ids
  or old.source_occurrences is distinct from new.source_occurrences
  or old.search_text is distinct from new.search_text
  or old.search_reading is distinct from new.search_reading
  or old.record_status is distinct from new.record_status
)
execute function public.bump_edit_version();

create index if not exists stories_story_type_idx
  on public.stories (story_type);

create index if not exists stories_title_reading_idx
  on public.stories (title_reading);

create index if not exists stories_series_title_reading_idx
  on public.stories (series_title_reading);

create index if not exists stories_first_published_date_idx
  on public.stories (first_published_date);

create index if not exists stories_status_idx
  on public.stories (status);

create index if not exists stories_record_status_owner_user_id_idx
  on public.stories (record_status, owner_user_id);

create index if not exists stories_updated_at_idx
  on public.stories (updated_at);

create index if not exists stories_tags_gin_idx
  on public.stories using gin (tags);

create index if not exists stories_contributors_gin_idx
  on public.stories using gin (contributors);

create index if not exists stories_source_work_ids_gin_idx
  on public.stories using gin (source_work_ids);

create index if not exists stories_search_text_trgm_idx
  on public.stories using gin (search_text gin_trgm_ops);

create index if not exists stories_search_reading_trgm_idx
  on public.stories using gin (search_reading gin_trgm_ops);

alter table public.stories enable row level security;

create policy "published stories are readable"
on public.stories
for select
to anon, authenticated
using (
  record_status = 'published'
  and status <> 'deleted'
);

create policy "owners can read their story drafts"
on public.stories
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "owners can insert story drafts"
on public.stories
for insert
to authenticated
with check (
  record_status = 'draft'
  and owner_user_id = auth.uid()
  and created_by = auth.uid()
);

create policy "owners can update story drafts"
on public.stories
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and record_status = 'draft'
)
with check (
  owner_user_id = auth.uid()
  and record_status = 'draft'
);
