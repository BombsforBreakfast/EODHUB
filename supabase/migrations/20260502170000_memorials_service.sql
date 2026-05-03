-- Military branch for memorials (category = military): Army, Navy, Marines, Air Force

alter table public.memorials
  add column if not exists service text;

comment on column public.memorials.service is 'When category is military: Army | Navy | Marines | Air Force (matches profiles.service / service seals).';
