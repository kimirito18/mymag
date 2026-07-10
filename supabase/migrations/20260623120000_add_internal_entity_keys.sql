create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_internal_id(prefix text, byte_length integer default 9)
returns text
language plpgsql
as $$
declare
  raw_token text;
begin
  if prefix !~ '^[a-z]{2}$' then
    raise exception 'internal id prefix must be two lowercase letters: %', prefix;
  end if;

  raw_token := regexp_replace(
    translate(encode(extensions.gen_random_bytes(byte_length), 'base64'), E'+/=\n', 'xyzq'),
    '[^A-Za-z0-9]',
    '',
    'g'
  );

  return prefix || '_' || left(raw_token, greatest(12, byte_length));
end;
$$;

alter table public.authors
  add column id text;

update public.authors
set id = public.generate_internal_id('au')
where id is null;

alter table public.authors
  alter column id set default public.generate_internal_id('au'),
  alter column id set not null;

create unique index authors_id_key
  on public.authors (id);

alter table public.author_alias_links
  add column author_key_1 text,
  add column author_key_2 text;

update public.author_alias_links link
set
  author_key_1 = least(author_1.id, author_2.id),
  author_key_2 = greatest(author_1.id, author_2.id)
from public.authors author_1
cross join public.authors author_2
where author_1.author_id = link.author_id_1
  and author_2.author_id = link.author_id_2
  and (link.author_key_1 is null or link.author_key_2 is null);

alter table public.author_alias_links
  alter column author_key_1 set not null,
  alter column author_key_2 set not null,
  add constraint author_alias_links_author_key_1_fkey
    foreign key (author_key_1) references public.authors(id) on delete restrict,
  add constraint author_alias_links_author_key_2_fkey
    foreign key (author_key_2) references public.authors(id) on delete restrict,
  add constraint author_alias_links_author_key_order_check
    check (author_key_1 < author_key_2);

create unique index author_alias_links_author_key_pair_key
  on public.author_alias_links (author_key_1, author_key_2);

create index author_alias_links_author_key_2_idx
  on public.author_alias_links (author_key_2);

alter table public.publishers
  add column id text;

update public.publishers
set id = public.generate_internal_id('pu')
where id is null;

alter table public.publishers
  alter column id set default public.generate_internal_id('pu'),
  alter column id set not null;

create unique index publishers_id_key
  on public.publishers (id);

alter table public.magazine_titles
  add column id text,
  add column publisher_key text;

update public.magazine_titles mt
set
  id = coalesce(mt.id, public.generate_internal_id('mt')),
  publisher_key = p.id
from public.publishers p
where p.publisher_id = mt.publisher_id
  and (mt.id is null or mt.publisher_key is null);

alter table public.magazine_titles
  alter column id set default public.generate_internal_id('mt'),
  alter column id set not null,
  alter column publisher_key set not null,
  add constraint magazine_titles_publisher_key_fkey
    foreign key (publisher_key) references public.publishers(id) on delete restrict;

create unique index magazine_titles_id_key
  on public.magazine_titles (id);

create index magazine_titles_publisher_key_idx
  on public.magazine_titles (publisher_key);

alter table public.magazine_issues
  add column id text,
  add column magazine_key text,
  add column publisher_key text;

update public.magazine_issues mi
set
  id = coalesce(mi.id, public.generate_internal_id('mi')),
  magazine_key = mt.id,
  publisher_key = p.id
from public.magazine_titles mt
cross join public.publishers p
where mt.magazine_id = mi.magazine_id
  and p.publisher_id = mi.publisher_id
  and (mi.id is null or mi.magazine_key is null or mi.publisher_key is null);

alter table public.magazine_issues
  alter column id set default public.generate_internal_id('mi'),
  alter column id set not null,
  alter column magazine_key set not null,
  alter column publisher_key set not null,
  add constraint magazine_issues_magazine_key_fkey
    foreign key (magazine_key) references public.magazine_titles(id) on delete restrict,
  add constraint magazine_issues_publisher_key_fkey
    foreign key (publisher_key) references public.publishers(id) on delete restrict;

create unique index magazine_issues_id_key
  on public.magazine_issues (id);

create index magazine_issues_magazine_key_idx
  on public.magazine_issues (magazine_key);

create index magazine_issues_publisher_key_idx
  on public.magazine_issues (publisher_key);

alter table public.stories
  add column id text,
  add column first_magazine_issue_key text,
  add column merged_into_story_key text;

update public.stories
set id = public.generate_internal_id('st')
where id is null;

update public.stories story
set first_magazine_issue_key = issue.id
from public.magazine_issues issue
where issue.magazine_issue_id = story.first_magazine_issue_id
  and story.first_magazine_issue_id is not null
  and story.first_magazine_issue_key is null;

update public.stories story
set merged_into_story_key = merged_story.id
from public.stories merged_story
where merged_story.story_id = story.merged_into_story_id
  and story.merged_into_story_id is not null
  and story.merged_into_story_key is null;

alter table public.stories
  alter column id set default public.generate_internal_id('st'),
  alter column id set not null;

create unique index stories_id_key
  on public.stories (id);

alter table public.stories
  add constraint stories_first_magazine_issue_key_fkey
    foreign key (first_magazine_issue_key) references public.magazine_issues(id) on delete restrict,
  add constraint stories_merged_into_story_key_fkey
    foreign key (merged_into_story_key) references public.stories(id) on delete restrict;

create index stories_first_magazine_issue_key_idx
  on public.stories (first_magazine_issue_key);

create index stories_merged_into_story_key_idx
  on public.stories (merged_into_story_key);
