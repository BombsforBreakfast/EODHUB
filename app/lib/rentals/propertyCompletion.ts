import { propertySchema, type PropertyDraft } from "./provider";
const sections = ["Property details", "Rental terms", "Photos & features", "Contact & description"];
const fields: Record<string, [number, string]> = {
  title: [0, "Listing headline"], propertyType: [0, "Property type"], address: [0, "Street address"], city: [0, "City"], state: [0, "State"], zip: [0, "ZIP code"], installation: [0, "Nearby installation"],
  rent: [1, "Rental amount"], rentPeriod: [1, "Pricing period"], priceBasis: [1, "Room or whole property"], bedrooms: [1, "Bedrooms"], bathrooms: [1, "Bathrooms"], minimumLeaseMonths: [1, "Lease length"], deposit: [1, "Deposit"], fees: [1, "Additional fees"], utilities: [1, "Included utilities"], petDetails: [1, "Pet policy"], militaryLeaseAccepted: [1, "Lease and course-drop acknowledgement"], militaryLeaseVersion: [1, "Lease and course-drop acknowledgement"],
  photos: [2, "Property photos"], amenities: [2, "Property features"], photoRightsAccepted: [2, "Photo ownership acknowledgement"],
  contactName: [3, "Contact name"], contactPhone: [3, "Phone number"], contactEmail: [3, "Email address"], company: [3, "Company field"], description: [3, "Property description"],
};
const guidance: Record<string, string> = {
  title: "Enter a listing headline (up to 140 characters).", address: "Enter the full street address (up to 220 characters).",
  city: "Enter the city (up to 100 characters).", state: "Choose a state.", zip: "Enter a ZIP code such as 32541 or 32541-1234.",
  installation: "Enter the nearby installation or EOD community (up to 160 characters).", propertyType: "Choose a long-term property type.",
  rent: "Enter monthly rent greater than $0 and no more than $100,000.", rentPeriod: "Quote the rent per month.", priceBasis: "Choose whether rent covers a room or the entire property.",
  bedrooms: "Enter a whole number from 0 to 1,000.", bathrooms: "Enter a number from 0.5 to 1,000.", minimumLeaseMonths: "Enter a whole number of months from 9 to 120.",
  deposit: "Enter a deposit from $0 to $100,000; use 0 for none.", fees: "Describe additional fees, or enter None (up to 1,500 characters).",
  utilities: "List included utilities, or enter None (up to 1,000 characters).", petDetails: "Describe your pet policy (up to 1,000 characters).",
  militaryLeaseAccepted: "Please acknowledge the lease and military termination terms.", militaryLeaseVersion: "Please acknowledge the current lease and course-drop terms.",
  photos: "Add at least one property photo (up to 100).", photoRightsAccepted: "Confirm ownership and permission to use these photos.", amenities: "Choose features from the options provided.",
  contactName: "Enter a public contact name (up to 120 characters).", contactPhone: "Enter a phone number from 7 to 40 characters.",
  contactEmail: "Enter a valid email address, such as owner@example.com.", company: "Use up to 160 characters for the company name.",
  description: "Describe the property in 40 to 6,000 characters.",
};
export function rentalFieldErrors(draft: PropertyDraft) {
  const parsed = propertySchema.safeParse(draft);
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    errors[key === "militaryLeaseVersion" ? "militaryLeaseAccepted" : key] = guidance[key] ?? "Check this property detail.";
  }
  return errors;
}
export function rentalFieldStep(key: string) { return fields[key]?.[0] ?? 3; }
export function rentalWizardGaps(issues: { path: readonly PropertyKey[] }[]) {
  const grouped = new Map<number, Set<string>>();
  for (const issue of issues) {
    const [step, label] = fields[String(issue.path[0])] ?? [3, "Property information"];
    const group = grouped.get(step) ?? new Set<string>(); group.add(label); grouped.set(step, group);
  }
  return [...grouped].sort(([a], [b]) => a - b).map(([step, labels]) => ({ step, title: sections[step], fields: [...labels] }));
}
