alter table public.audit_logs
drop constraint if exists audit_logs_actor_user_id_fkey,
add constraint audit_logs_actor_user_id_fkey
foreign key (actor_user_id) references public.users(id) on delete set null;

alter table public.author_alias_links
drop constraint if exists author_alias_links_created_by_fkey,
add constraint author_alias_links_created_by_fkey
foreign key (created_by) references public.users(id) on delete set null;

alter table public.authors
drop constraint if exists authors_owner_user_id_fkey,
drop constraint if exists authors_created_by_fkey,
drop constraint if exists authors_updated_by_fkey,
drop constraint if exists authors_submitted_by_fkey,
drop constraint if exists authors_approved_by_fkey,
drop constraint if exists authors_deleted_by_fkey,
add constraint authors_owner_user_id_fkey foreign key (owner_user_id) references public.users(id) on delete set null,
add constraint authors_created_by_fkey foreign key (created_by) references public.users(id) on delete set null,
add constraint authors_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null,
add constraint authors_submitted_by_fkey foreign key (submitted_by) references public.users(id) on delete set null,
add constraint authors_approved_by_fkey foreign key (approved_by) references public.users(id) on delete set null,
add constraint authors_deleted_by_fkey foreign key (deleted_by) references public.users(id) on delete set null;

alter table public.publishers
drop constraint if exists publishers_owner_user_id_fkey,
drop constraint if exists publishers_created_by_fkey,
drop constraint if exists publishers_updated_by_fkey,
drop constraint if exists publishers_submitted_by_fkey,
drop constraint if exists publishers_approved_by_fkey,
drop constraint if exists publishers_deleted_by_fkey,
add constraint publishers_owner_user_id_fkey foreign key (owner_user_id) references public.users(id) on delete set null,
add constraint publishers_created_by_fkey foreign key (created_by) references public.users(id) on delete set null,
add constraint publishers_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null,
add constraint publishers_submitted_by_fkey foreign key (submitted_by) references public.users(id) on delete set null,
add constraint publishers_approved_by_fkey foreign key (approved_by) references public.users(id) on delete set null,
add constraint publishers_deleted_by_fkey foreign key (deleted_by) references public.users(id) on delete set null;

alter table public.magazine_titles
drop constraint if exists magazine_titles_owner_user_id_fkey,
drop constraint if exists magazine_titles_created_by_fkey,
drop constraint if exists magazine_titles_updated_by_fkey,
drop constraint if exists magazine_titles_submitted_by_fkey,
drop constraint if exists magazine_titles_approved_by_fkey,
drop constraint if exists magazine_titles_deleted_by_fkey,
add constraint magazine_titles_owner_user_id_fkey foreign key (owner_user_id) references public.users(id) on delete set null,
add constraint magazine_titles_created_by_fkey foreign key (created_by) references public.users(id) on delete set null,
add constraint magazine_titles_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null,
add constraint magazine_titles_submitted_by_fkey foreign key (submitted_by) references public.users(id) on delete set null,
add constraint magazine_titles_approved_by_fkey foreign key (approved_by) references public.users(id) on delete set null,
add constraint magazine_titles_deleted_by_fkey foreign key (deleted_by) references public.users(id) on delete set null;

alter table public.magazine_issues
drop constraint if exists magazine_issues_owner_user_id_fkey,
drop constraint if exists magazine_issues_created_by_fkey,
drop constraint if exists magazine_issues_updated_by_fkey,
drop constraint if exists magazine_issues_submitted_by_fkey,
drop constraint if exists magazine_issues_approved_by_fkey,
drop constraint if exists magazine_issues_deleted_by_fkey,
add constraint magazine_issues_owner_user_id_fkey foreign key (owner_user_id) references public.users(id) on delete set null,
add constraint magazine_issues_created_by_fkey foreign key (created_by) references public.users(id) on delete set null,
add constraint magazine_issues_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null,
add constraint magazine_issues_submitted_by_fkey foreign key (submitted_by) references public.users(id) on delete set null,
add constraint magazine_issues_approved_by_fkey foreign key (approved_by) references public.users(id) on delete set null,
add constraint magazine_issues_deleted_by_fkey foreign key (deleted_by) references public.users(id) on delete set null;

alter table public.stories
drop constraint if exists stories_owner_user_id_fkey,
drop constraint if exists stories_created_by_fkey,
drop constraint if exists stories_updated_by_fkey,
drop constraint if exists stories_submitted_by_fkey,
drop constraint if exists stories_approved_by_fkey,
drop constraint if exists stories_deleted_by_fkey,
add constraint stories_owner_user_id_fkey foreign key (owner_user_id) references public.users(id) on delete set null,
add constraint stories_created_by_fkey foreign key (created_by) references public.users(id) on delete set null,
add constraint stories_updated_by_fkey foreign key (updated_by) references public.users(id) on delete set null,
add constraint stories_submitted_by_fkey foreign key (submitted_by) references public.users(id) on delete set null,
add constraint stories_approved_by_fkey foreign key (approved_by) references public.users(id) on delete set null,
add constraint stories_deleted_by_fkey foreign key (deleted_by) references public.users(id) on delete set null;
