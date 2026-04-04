import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient, getProvidersForEmail } from "../../lib/auth/adminAuthLookup";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ providers: [] as string[] });
  }

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return NextResponse.json({ providers: [] as string[] });
  }

  const { client, error } = createSupabaseServiceRoleClient();
  if (error === "missing_env") {
    return NextResponse.json({ providers: [] as string[], error: "unavailable" }, { status: 503 });
  }

  const { providers, listError } = await getProvidersForEmail(client!, normalized);
  if (listError) {
    return NextResponse.json({ providers: [] as string[], error: "lookup_failed" }, { status: 503 });
  }

  return NextResponse.json({ providers });
}
