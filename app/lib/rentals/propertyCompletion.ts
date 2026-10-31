const sections = ["Property details", "Rental terms", "Photos & features", "Contact & description"];
const fields: Record<string, [number, string]> = {
  title: [0, "Listing headline"], propertyType: [0, "Property type"], address: [0, "Street address"], city: [0, "City"], state: [0, "State"], zip: [0, "ZIP code"], installation: [0, "Nearby installation"],
  rent: [1, "Rental amount"], rentPeriod: [1, "Pricing period"], priceBasis: [1, "Room or whole property"], bedrooms: [1, "Bedrooms"], bathrooms: [1, "Bathrooms"], minimumLeaseMonths: [1, "Lease length"], deposit: [1, "Deposit"], fees: [1, "Additional fees"], utilities: [1, "Included utilities"], petDetails: [1, "Pet policy"], militaryLeaseAccepted: [1, "Military lease acknowledgement"],
  photos: [2, "Property photos"], amenities: [2, "Property features"], photoRightsAccepted: [2, "Photo ownership acknowledgement"],
  contactName: [3, "Contact name"], contactPhone: [3, "Phone number"], contactEmail: [3, "Email address"], company: [3, "Company field"], description: [3, "Property description"],
};
export function rentalWizardGaps(issues: { path: readonly PropertyKey[] }[]) {
  const grouped = new Map<number, Set<string>>();
  for (const issue of issues) {
    const [step, label] = fields[String(issue.path[0])] ?? [3, "Property information"];
    const group = grouped.get(step) ?? new Set<string>(); group.add(label); grouped.set(step, group);
  }
  return [...grouped].sort(([a], [b]) => a - b).map(([step, labels]) => ({ step, title: sections[step], fields: [...labels] }));
}
