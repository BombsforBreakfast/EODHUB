alter table public.units
  drop constraint if exists units_created_by_fkey,
  add constraint units_created_by_fkey
    foreign key (created_by) references public.profiles(user_id) on delete set null;

alter table public.unit_members
  drop constraint if exists unit_members_user_id_fkey,
  add constraint unit_members_user_id_fkey
    foreign key (user_id) references public.profiles(user_id) on delete cascade;

alter table public.unit_posts
  drop constraint if exists unit_posts_user_id_fkey,
  add constraint unit_posts_user_id_fkey
    foreign key (user_id) references public.profiles(user_id) on delete cascade;

alter table public.unit_post_comments
  drop constraint if exists unit_post_comments_user_id_fkey,
  add constraint unit_post_comments_user_id_fkey
    foreign key (user_id) references public.profiles(user_id) on delete cascade;

alter table public.unit_post_likes
  drop constraint if exists unit_post_likes_user_id_fkey,
  add constraint unit_post_likes_user_id_fkey
    foreign key (user_id) references public.profiles(user_id) on delete cascade;

alter table public.unit_join_approvals
  drop constraint if exists unit_join_approvals_requester_user_id_fkey,
  add constraint unit_join_approvals_requester_user_id_fkey
    foreign key (requester_user_id) references public.profiles(user_id) on delete set null;

alter table public.unit_join_approvals
  drop constraint if exists unit_join_approvals_approver_user_id_fkey,
  add constraint unit_join_approvals_approver_user_id_fkey
    foreign key (approver_user_id) references public.profiles(user_id) on delete set null;

alter table public.profile_vouches
  drop constraint if exists profile_vouches_voucher_user_id_fkey,
  add constraint profile_vouches_voucher_user_id_fkey
    foreign key (voucher_user_id) references public.profiles(user_id) on delete cascade;

alter table public.profile_vouches
  drop constraint if exists profile_vouches_vouchee_user_id_fkey,
  add constraint profile_vouches_vouchee_user_id_fkey
    foreign key (vouchee_user_id) references public.profiles(user_id) on delete cascade;
