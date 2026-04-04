import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Public total of profiles (signed-up accounts). No PII — count only.
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
  const { count, error } = await admin
    .from("profiles")
    .select("*", { count: "exact", head: true });

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
    { count: count ?? 0 },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
