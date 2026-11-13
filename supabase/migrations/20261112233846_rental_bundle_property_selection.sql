-- Keep ownership separate from the listings covered by a paid term and the next checkout.
alter table public.rental_legacy_bundles add column available_listing_ids text[], add column checkout_listing_ids text[];
update public.rental_legacy_bundles set available_listing_ids=listing_ids,checkout_listing_ids=listing_ids;
alter table public.rental_legacy_bundles alter column available_listing_ids set not null,alter column checkout_listing_ids set not null;
alter table public.rental_legacy_bundles add constraint rental_bundle_selected_inventory check (
 cardinality(available_listing_ids) between 1 and 50 and cardinality(checkout_listing_ids) between 1 and 50
 and listing_ids <@ available_listing_ids and checkout_listing_ids <@ available_listing_ids
);
create or replace function public.rental_legacy_bundle_disjoint() returns trigger language plpgsql set search_path='' as $$
begin
 new.available_listing_ids:=coalesce(new.available_listing_ids,new.listing_ids);
 new.checkout_listing_ids:=coalesce(new.checkout_listing_ids,new.listing_ids);
 perform pg_advisory_xact_lock(81246125);
 if exists(select 1 from public.rental_legacy_bundles b where b.id<>new.id and b.available_listing_ids && new.available_listing_ids)
 or cardinality(new.available_listing_ids)<>(select count(distinct x) from unnest(new.available_listing_ids) x)
 or cardinality(new.listing_ids)<>(select count(distinct x) from unnest(new.listing_ids) x)
 or cardinality(new.checkout_listing_ids)<>(select count(distinct x) from unnest(new.checkout_listing_ids) x) then
   raise exception 'Listing already assigned to a bundle or duplicated';
 end if;
 return new;
end $$;
drop trigger rental_legacy_bundle_disjoint on public.rental_legacy_bundles;
create trigger rental_legacy_bundle_disjoint before insert or update of listing_ids,available_listing_ids,checkout_listing_ids on public.rental_legacy_bundles
for each row execute function public.rental_legacy_bundle_disjoint();
