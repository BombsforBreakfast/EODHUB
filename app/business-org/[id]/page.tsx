import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import BusinessOrgPublicPageClient from "../../components/commerce/BusinessOrgPublicPageClient";
import type { BusinessOrgPageRow } from "../../lib/businessOrgPages";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BusinessOrgPublicPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await supabase
    .from("business_organization_pages")
    .select("id, business_name, description, business_email, logo_url, website_url, location, address, phone, owner_info, page_type")
    .eq("id", id)
    .eq("is_active", true)
    .eq("verification_status", "approved")
    .maybeSingle();

  if (!data) notFound();
  const page = data as Pick<
    BusinessOrgPageRow,
    "id" | "business_name" | "description" | "business_email" | "logo_url" | "website_url" | "location" | "address" | "phone" | "owner_info" | "page_type"
  >;

  return <BusinessOrgPublicPageClient page={page} />;
}
