begin;

create table public.promotion_requests (
  id uuid primary key,
  recipient_id uuid not null references auth.users(id),
  access_hash text not null check (length(access_hash) = 64),
  package text not null check (package in ('Basic','Featured','Premium')),
  name text not null check (length(name) between 2 and 120),
  email text not null check (length(email) between 3 and 254),
  phone text not null check (length(phone) between 7 and 40),
  business text not null default '' check (length(business) <= 160),
  promotion_type text not null,
  description text not null check (length(description) between 20 and 12000),
  destination text not null default '' check (length(destination) <= 2000),
  timing text not null default '' check (length(timing) <= 500),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
  status text not null default 'draft' check (status in ('draft','expired','new','reviewing','contacted','complete','declined')),
  admin_notes text not null default '' check (length(admin_notes) <= 12000),
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
create index promotion_requests_review_queue on public.promotion_requests(recipient_id, status, submitted_at desc);
create index promotion_requests_drafts on public.promotion_requests(created_at) where status = 'draft';
alter table public.promotion_requests enable row level security;
revoke all on public.promotion_requests from anon, authenticated;
grant select on public.promotion_requests to authenticated;
grant all on public.promotion_requests to service_role;
create policy promotion_owner_read on public.promotion_requests for select to authenticated
using (recipient_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.user_id = (select auth.uid())
  and p.is_admin = true and lower(p.email) = 'micheal.p.twigg@gmail.com'
));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('promotion-materials','promotion-materials',false,3145728,array['image/webp'])
on conflict(id) do update set public=false, file_size_limit=3145728, allowed_mime_types=array['image/webp'];
-- No browser storage policies: only the server uploads or signs owner-only reads.
-- Restrictive guard also prevents older broad storage policies from exposing
-- this new bucket to ordinary authenticated users or anonymous visitors.
create policy promotion_materials_isolated on storage.objects as restrictive
for all to anon,authenticated using (bucket_id <> 'promotion-materials')
with check (bucket_id <> 'promotion-materials');

create function public.start_promotion_request(p_id uuid,p_owner text,p_recipient uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.promotion_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner,0));
  if length(p_owner) <> 64 or not exists (
    select 1 from public.profiles where user_id=p_recipient and is_admin=true and lower(email)='micheal.p.twigg@gmail.com'
  ) then raise exception 'Invalid reviewer'; end if;
  select * into v from public.promotion_requests where id=p_id for update;
  if found then
    if v.access_hash <> p_owner or v.created_at < now()-interval '24 hours' then raise exception 'Draft unavailable'; end if;
    -- Retry is deliberately immutable: text and package are the reviewed snapshot.
    return v.id;
  end if;
  if (select count(*) from public.promotion_requests where access_hash=p_owner and created_at>now()-interval '24 hours') >= 10 then
    raise exception 'Daily request limit reached';
  end if;
  insert into public.promotion_requests(id,recipient_id,access_hash,package,name,email,phone,business,promotion_type,description,destination,timing)
  values(p_id,p_recipient,p_owner,p_input->>'package',p_input->>'name',p_input->>'email',p_input->>'phone',
    p_input->>'business',p_input->>'promotionType',p_input->>'description',p_input->>'destination',p_input->>'timing');
  return p_id;
end $$;

create function public.attach_promotion_image(p_id uuid,p_owner text,p_file jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v public.promotion_requests;
begin
  select * into v from public.promotion_requests where id=p_id and access_hash=p_owner for update;
  if not found then raise exception 'Draft unavailable'; end if;
  if exists(select 1 from jsonb_array_elements(v.attachments) a where a->>'path'=p_file->>'path') then return; end if;
  if v.status<>'draft' or v.created_at<now()-interval '24 hours' then raise exception 'Draft unavailable'; end if;
  if jsonb_array_length(v.attachments)>=5 or p_file->>'path' not like p_id::text || '/%' then raise exception 'Invalid attachment'; end if;
  update public.promotion_requests set attachments=attachments || jsonb_build_array(p_file),updated_at=now() where id=p_id;
end $$;

create function public.submit_promotion_request(p_id uuid,p_owner text,p_image_count integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.promotion_requests; n public.notifications;
begin
  select * into v from public.promotion_requests where id=p_id and access_hash=p_owner for update;
  if not found then raise exception 'Draft unavailable'; end if;
  if v.status='expired' then raise exception 'Draft expired'; end if;
  if v.status<>'draft' then
    return jsonb_build_object('recipient_id',v.recipient_id,'notification_id',v.notification_id,'already',true);
  end if;
  if v.created_at<now()-interval '24 hours' or p_image_count<>jsonb_array_length(v.attachments) then raise exception 'Images incomplete'; end if;
  if not exists(select 1 from public.profiles where user_id=v.recipient_id and is_admin=true and lower(email)='micheal.p.twigg@gmail.com') then raise exception 'Reviewer unavailable'; end if;
  select * into n from public.create_notification(
    p_recipient_user_id=>v.recipient_id, p_type=>'promotion_request', p_category=>'system',
    p_entity_type=>'promotion_request', p_entity_id=>v.id,
    p_title=>'Promotion to review',p_body=>'A new promotion request is ready in your admin queue.',
    p_message=>v.package || ' promotion request ready for review.',
    p_link=>'/admin/promotions?request=' || v.id::text,
    p_group_key=>'promotion:' || v.id::text,p_dedupe_key=>'promotion:' || v.id::text,
    p_metadata=>jsonb_build_object('promotion_request_id',v.id)
  );
  update public.promotion_requests set status='new',notification_id=n.id,submitted_at=now(),updated_at=now() where id=p_id;
  return jsonb_build_object('recipient_id',v.recipient_id,'notification_id',n.id,'already',false);
end $$;

create function public.expire_promotion_drafts()
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.promotion_requests set status='expired',updated_at=now() where id in (
    select id from public.promotion_requests where status='draft' and created_at<now()-interval '24 hours'
    order by created_at limit 100 for update skip locked
  );
end $$;
revoke all on function public.expire_promotion_drafts() from public,anon,authenticated;
grant execute on function public.expire_promotion_drafts() to service_role;

revoke all on function public.start_promotion_request(uuid,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.attach_promotion_image(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.submit_promotion_request(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.start_promotion_request(uuid,text,uuid,jsonb) to service_role;
grant execute on function public.attach_promotion_image(uuid,text,jsonb) to service_role;
grant execute on function public.submit_promotion_request(uuid,text,integer) to service_role;
commit;
