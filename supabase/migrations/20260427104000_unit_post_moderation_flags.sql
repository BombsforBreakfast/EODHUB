alter table public.unit_posts
  add column if not exists hidden_for_review boolean not null default false;

create index if not exists unit_posts_hidden_for_review_idx
  on public.unit_posts (hidden_for_review)
  where hidden_for_review = true;

do $$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.flags'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%content_type%'
  loop
    execute format('alter table public.flags drop constraint %I', cname);
  end loop;
end$$;

alter table public.flags add constraint flags_content_type_check check (
  content_type in (
    'post',
    'unit_post',
    'comment',
    'message',
    'rabbithole_contribution',
    'rabbithole_contribution_comment',
    'rabbithole_thread',
    'rabbithole_reply'
  )
);
