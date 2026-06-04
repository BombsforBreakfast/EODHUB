import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { BusinessOrgPageRow } from "../lib/businessOrgPages";

export const dynamic = "force-dynamic";

export default async function BusinessOrgDirectoryPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await supabase
    .from("business_organization_pages")
    .select("id, business_name, description, business_email, logo_url, website_url, location")
    .eq("is_active", true)
    .eq("verification_status", "approved")
    .order("business_name", { ascending: true });

  const pages = (data ?? []) as Pick<
    BusinessOrgPageRow,
    "id" | "business_name" | "description" | "business_email" | "logo_url" | "website_url" | "location"
  >[];

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 18px 64px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Business / Organization Pages</h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.55 }}>
            Public pages for EOD-HUB businesses and organizations.
          </p>
        </div>
        <Link href="/account/business-pages" style={{ color: "#2563eb", fontWeight: 800 }}>
          Create or manage a page
        </Link>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 26 }}>
        {pages.length === 0 ? (
          <div style={{ color: "#64748b" }}>No approved Business / Organization pages yet.</div>
        ) : (
          pages.map((page) => (
            <Link
              key={page.id}
              href={`/business-org/${page.id}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                padding: 16,
                background: "white",
                display: "grid",
                gap: 12,
              }}
            >
              <div style={{ height: 92, borderRadius: 14, background: "#f8fafc", display: "grid", placeItems: "center", overflow: "hidden" }}>
                <img src={page.logo_url} alt={`${page.business_name} logo`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{page.business_name}</h2>
                {page.location && <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>{page.location}</div>}
              </div>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.5 }}>{page.description}</p>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
