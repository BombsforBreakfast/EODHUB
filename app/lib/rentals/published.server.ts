import "server-only";
import { rentalDatabase } from "./portal.server";
import { listingHasPaidAccess, propertySchema } from "./provider";
import type { RentalListing, RentalOwner } from "./catalog";

export async function publishedRentalInventory() {
  const db = rentalDatabase();
  const { data, error } = await db.from("rental_properties").select("*,provider:rental_providers!inner(status,full_name,email,phone,company)").not("published","is",null).eq("hidden",false).eq("provider.status","approved").order("created_at",{ascending:false}).limit(2000);
  if (error) {
    console.error("[rentals] Provider inventory unavailable",error.code);
    return {listings:[] as RentalListing[],owners:[] as RentalOwner[],unavailable:true};
  }
  const listings: RentalListing[] = [], owners = new Map<string,RentalOwner>();
  for (const row of data ?? []) {
    if (!listingHasPaidAccess(row)) continue;
    const parsed = propertySchema.safeParse(row.published); if (!parsed.success) continue;
    const p = parsed.data, owner = row.provider;
    owners.set(row.provider_id, { id:row.provider_id, name:owner.company || owner.full_name, email:owner.email });
    listings.push({ id:row.id,ownerId:row.provider_id,title:p.title,address:p.address,city:p.city,state:p.state,zip:p.zip,
      monthlyRent:p.rent,rentPeriod:p.rentPeriod,priceBasis:p.priceBasis,bedrooms:p.bedrooms,bathrooms:p.bathrooms,propertyType:p.propertyType,
      furnished:p.amenities.includes("Furnished"),availability:{status:row.status},projectedAvailabilityDate:row.available_date??undefined,
      availabilityUpdatedAt:row.updated_at.slice(0,10),description:p.description,highlights:p.amenities,nearby:[p.installation],
      rentalTerms:{minimumLeaseMonths:p.minimumLeaseMonths,deposit:p.deposit,fees:p.fees,utilities:p.utilities,petDetails:p.petDetails},
      providerContact:{name:p.contactName,email:p.contactEmail,phone:p.contactPhone,company:p.company},
      portalListing:true,photos:p.photos.map((_,i)=>`/api/rentals/photo?property=${row.id}&photo=${i}&v=${row.submission_id}`),
    });
  }
  return { listings,owners:[...owners.values()],unavailable:false };
}
