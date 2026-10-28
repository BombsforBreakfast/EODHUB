import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Public Hub signup total. Rental-only identities never count as Hub members.
 * The server-only database aggregate returns no PII and preserves the existing
 * count of all other Hub profile rows.
 * Used on the login page; keep fresh (no CDN cache).
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { count: 0 },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }

  const admin = createClient(url, key);
  const { data, error } = await admin.rpc("hub_member_signup_count");

  if (error) {
    console.error("public-signup-count:", error.message);
    return NextResponse.json(
      { count: 0 },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }

  return NextResponse.json(
    { count: Number(data ?? 0) },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
