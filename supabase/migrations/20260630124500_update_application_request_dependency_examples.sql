begin;

update public.application_requests
set
  entity_type = 'magazine_title',
  entity_id = 'M900001',
  title = '申請テスト雑誌セット',
  parent_label = '雑誌マスター',
  action = 'create',
  status = 'draft',
  route_path = '/masters/magazines',
  metadata = jsonb_build_object(
    'note', 'editor-A 実DBテスト用の雑誌マスター新規下書き',
    'name', '申請テスト雑誌セット',
    'reading', 'しんせいてすとざっしせっと',
    'dependencyGroupId', 'DG000001',
    'dependencyGroupLabel', '申請テスト雑誌セット'
  ),
  submitted_at = null,
  reviewed_at = null,
  reviewer_note = '',
  updated_at = now()
where request_id = 'AR000003';

update public.application_requests
set
  entity_type = 'magazine_issue_set',
  entity_id = 'MI900001',
  title = '申請テスト雑誌セット 2099年01月号',
  parent_label = '申請テスト雑誌セット',
  action = 'create',
  status = 'draft',
  route_path = '/magazines/M900001/issues/new?from=issue-list',
  metadata = jsonb_build_object(
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
  submitted_at = null,
  reviewed_at = null,
  reviewer_note = '',
  updated_at = now()
where request_id = 'AR000004';

commit;
