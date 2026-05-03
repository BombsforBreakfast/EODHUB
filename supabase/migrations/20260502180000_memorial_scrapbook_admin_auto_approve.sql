-- Allow memorial scrapbook rows inserted by admins to be created as approved (auto-publish).

create or replace function public.trg_memorial_scrapbook_items_validate_ins()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_admin boolean := false;
begin
  select coalesce(p.is_admin, false) into v_admin
  from public.profiles p
  where p.user_id = auth.uid();

  if new.status = 'approved' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'Invalid scrapbook submission';
    end if;
    if not v_admin then
      raise exception 'Scrapbook items must be submitted as pending';
    end if;
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  elsif new.status is distinct from 'pending' then
    raise exception 'Scrapbook items must be submitted as pending';
  end if;

  if not exists (select 1 from public.memorials m where m.id = new.memorial_id) then
    raise exception 'Memorial not found';
  end if;

  if new.item_type = 'photo' then
    if new.file_url is null or trim(new.file_url) = '' then
      raise exception 'Photo items require a file upload';
    end if;
  elsif new.item_type = 'document' then
    if new.file_url is null or trim(new.file_url) = '' then
      raise exception 'Document items require a file upload';
    end if;
  elsif new.item_type = 'article' then
    if new.external_url is null or trim(new.external_url) = '' then
      raise exception 'Article items require an external URL';
    end if;
  elsif new.item_type = 'memory' then
    if coalesce(trim(new.memory_body), '') = '' and coalesce(trim(new.caption), '') = '' then
      raise exception 'Memory items require text in the memory or caption field';
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists memorial_scrapbook_items_insert_own on public.memorial_scrapbook_items;
create policy memorial_scrapbook_items_insert_own
  on public.memorial_scrapbook_items
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      status = 'pending'
      or (
        status = 'approved'
        and exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and coalesce(p.is_admin, false)
        )
      )
    )
  );
