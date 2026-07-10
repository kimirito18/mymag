create table if not exists public.message_threads (
  message_thread_id uuid primary key default gen_random_uuid(),
  thread_type text not null check (thread_type in ('general', 'application')),
  title text not null,
  visibility_scope text not null default 'all_members'
    check (visibility_scope in ('all_members')),
  application_group_id text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text not null default '',
  last_message_type text not null default 'text'
    check (last_message_type in ('text', 'system')),
  last_message_by_user_id uuid references public.users(id) on delete set null,
  is_closed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,

  constraint message_threads_application_group_required
    check (
      (thread_type = 'application' and application_group_id is not null and btrim(application_group_id) <> '')
      or
      (thread_type = 'general' and application_group_id is null)
    )
);

create unique index if not exists message_threads_application_group_idx
on public.message_threads (application_group_id)
where thread_type = 'application';

create index if not exists message_threads_type_last_message_idx
on public.message_threads (thread_type, last_message_at desc nulls last);

create table if not exists public.messages (
  message_id uuid primary key default gen_random_uuid(),
  message_thread_id uuid not null references public.message_threads(message_thread_id) on delete cascade,
  sender_user_id uuid references public.users(id) on delete set null,
  message_type text not null check (message_type in ('text', 'system')),
  body text not null default '',
  event_type text,
  application_request_id text,
  application_group_id text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists messages_thread_created_at_idx
on public.messages (message_thread_id, created_at asc);

create index if not exists messages_application_group_idx
on public.messages (application_group_id, created_at asc)
where application_group_id is not null;

create table if not exists public.message_reads (
  message_thread_id uuid not null references public.message_threads(message_thread_id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_read_message_id uuid references public.messages(message_id) on delete set null,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (message_thread_id, user_id)
);

create index if not exists message_reads_user_last_read_idx
on public.message_reads (user_id, last_read_at desc nulls last);
