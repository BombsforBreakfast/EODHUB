import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFICATION_DOCS_BUCKET = "verification-docs";
const SIGNED_URL_TTL_SEC = 60 * 10;

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("eod_cert_path, eod_cert_file_name")
    .eq("user_id", userId)
    .maybeSingle<{ eod_cert_path: string | null; eod_cert_file_name: string | null }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const path = profile?.eod_cert_path?.trim();
  if (!path) {
    return NextResponse.json({ error: "No EOD certificate on file." }, { status: 404 });
  }

  const { data: signed, error: signError } = await adminClient.storage
    .from(VERIFICATION_DOCS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message ?? "Could not create signed URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    filename: profile?.eod_cert_file_name?.trim() || path.split("/").pop() || "eod-cert",
  });
}
