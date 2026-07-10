begin;

with editor_a as (
  select id
  from public.users
  where login_name = 'editor-A'
  limit 1
)
insert into public.application_requests (
  request_id,
  entity_type,
  entity_id,
  title,
  parent_label,
  action,
  status,
  route_path,
  metadata,
  requested_by_user_id,
  submitted_at,
  reviewed_at,
  reviewer_note,
  created_at,
  updated_at
)
select *
from (
  select
    'AR000001' as request_id,
    'author' as entity_type,
    'A900001' as entity_id,
    '申請テスト著者A' as title,
    '著者マスター' as parent_label,
    'create' as action,
    'submitted' as status,
    '/masters/authors' as route_path,
    jsonb_build_object(
      'note', 'editor-A 実DBテスト用の著者新規申請',
      'name', '申請テスト著者A',
      'reading', 'しんせいてすとちょしゃえー'
    ) as metadata,
    editor_a.id as requested_by_user_id,
    now() - interval '24 minutes' as submitted_at,
    null::timestamptz as reviewed_at,
    '' as reviewer_note,
    now() - interval '28 minutes' as created_at,
    now() - interval '24 minutes' as updated_at
  from editor_a

  union all

  select
    'AR000002',
    'publisher',
    'P000094',
    'アリスくらぶ社',
    '出版社マスター',
    'update',
    'submitted',
    '/masters/publishers/P000094',
    jsonb_build_object(
      'note', 'editor-A 実DBテスト用の出版社修正申請',
      'name', 'アリスくらぶ社',
      'reading', 'ありすくらぶしゃ'
    ),
    editor_a.id,
    now() - interval '19 minutes',
    null::timestamptz,
    '',
    now() - interval '22 minutes',
    now() - interval '19 minutes'
  from editor_a

  union all

  select
    'AR000003',
    'magazine_title',
    'M900001',
    '申請テスト雑誌セット',
    '雑誌マスター',
    'create',
    'draft',
    '/masters/magazines',
    jsonb_build_object(
      'note', 'editor-A 実DBテスト用の雑誌マスター新規下書き',
      'name', '申請テスト雑誌セット',
      'reading', 'しんせいてすとざっしせっと',
      'dependencyGroupId', 'DG000001',
      'dependencyGroupLabel', '申請テスト雑誌セット'
    ),
    editor_a.id,
    null::timestamptz,
    null::timestamptz,
    '',
    now() - interval '12 minutes',
    now() - interval '12 minutes'
  from editor_a

  union all

  select
    'AR000004',
    'magazine_issue_set',
    'MI900001',
    '申請テスト雑誌セット 2099年01月号',
    '申請テスト雑誌セット',
    'create',
    'draft',
    '/magazines/M900001/issues/new?from=issue-list',
    jsonb_build_object(
      'note', 'editor-A 実DBテスト用の雑誌個別セット新規下書き',
      'magazineId', 'M900001',
      'magazineTitle', '申請テスト雑誌セット',
      'issueTitle', '申請テスト雑誌セット',
      'issueLabel', '申請テスト雑誌セット 2099年01月号',
      'titleReading', 'しんせいてすとざっしせっと',
      'dependencyGroupId', 'DG000001',
      'dependencyGroupLabel', '申請テスト雑誌セット',
      'dependsOnRequestIds', jsonb_build_array('AR000003')
    ),
    editor_a.id,
    null::timestamptz,
    null::timestamptz,
    '',
    now() - interval '7 minutes',
    now() - interval '7 minutes'
  from editor_a
) seeded
on conflict (request_id) do update
set
  entity_type = excluded.entity_type,
  entity_id = excluded.entity_id,
  title = excluded.title,
  parent_label = excluded.parent_label,
  action = excluded.action,
  status = excluded.status,
  route_path = excluded.route_path,
  metadata = excluded.metadata,
  requested_by_user_id = excluded.requested_by_user_id,
  submitted_at = excluded.submitted_at,
  reviewed_at = excluded.reviewed_at,
  reviewer_note = excluded.reviewer_note,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

commit;
