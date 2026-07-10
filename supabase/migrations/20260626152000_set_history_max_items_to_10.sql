begin;

update public.user_settings
set
  ui_settings = coalesce(ui_settings, '{}'::jsonb) || jsonb_build_object('history_max_items', 10),
  updated_at = now()
where coalesce((ui_settings->>'history_max_items')::integer, 10) <> 10;

commit;
