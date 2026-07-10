begin;

set local statement_timeout = '5min';

with rebuilt as (
  select
    magazine_issue_id,
    jsonb_agg(
      case
        when content->>'content_type' = 'cover' then
          jsonb_set(
            jsonb_set(content, '{title}', to_jsonb('表紙'::text), true),
            '{contributors}',
            coalesce(
              (
                select jsonb_agg(
                  case
                    when contributor ? 'name' then
                      jsonb_set(contributor, '{role}', to_jsonb('イラスト'::text), true)
                    else
                      contributor
                  end
                  order by contributor_ordinality
                )
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(content->'contributors') = 'array' then content->'contributors'
                    else '[]'::jsonb
                  end
                ) with ordinality as contributor_rows(contributor, contributor_ordinality)
              ),
              '[]'::jsonb
            ),
            true
          )
        else
          content
      end
      order by content_ordinality
    ) as contents
  from public.magazine_issues
  cross join lateral jsonb_array_elements(contents) with ordinality as content_rows(content, content_ordinality)
  where jsonb_typeof(contents) = 'array'
  group by magazine_issue_id
)
update public.magazine_issues as mi
set
  contents = rebuilt.contents,
  updated_at = now()
from rebuilt
where mi.magazine_issue_id = rebuilt.magazine_issue_id
  and mi.contents is distinct from rebuilt.contents;

commit;
