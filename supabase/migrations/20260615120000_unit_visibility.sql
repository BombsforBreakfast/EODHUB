-- Group visibility: public groups appear in directory/search; private groups are invite-only discovery.
alter table public.units
  add column if not exists visibility text not null default 'private'
  check (visibility in ('public', 'private'));

comment on column public.units.visibility is
  'public: listed in group directory and wall readable without membership; private: hidden from directory, membership required for content';

-- All existing groups default private (including if column was added earlier with a public default).
update public.units set visibility = 'private';
