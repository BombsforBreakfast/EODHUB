import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertMemberInteractionAllowed } from "@/app/lib/memberSubscriptionServer";
import { isSignupProfileComplete } from "@/app/lib/profileCompleteness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOUCHABLE_STATUSES = ["awaiting_admin_review", "pending_admin_review", "pending"];
const CANDIDATE_POOL_LIMIT = 100;
const RESPONSE_LIMIT = 20;

type PendingProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  name?: string | null;
  photo_url: string | null;
  service: string | null;
  company_name: string | null;
  account_type: string | null;
  email_verified: boolean | null;
  verification_status: string | null;
  created_at: string | null;
  is_pure_admin?: boolean | null;
};

type VouchRow = {
  vouchee_user_id: string;
  voucher_user_id: string;
};

type VoucherProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
};

function displayName(row: VoucherProfileRow): string {
  return row.display_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Member";
}

export async function GET(req: NextRequest) {
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
  const user = authData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const gate = await assertMemberInteractionAllowed(adminClient, user.id);
  if (!gate.ok) {
    return NextResponse.json({ candidates: [], hidden_ids: [], error: gate.message }, { status: 200 });
  }

  const { data: viewer } = await adminClient
    .from("profiles")
    .select("is_admin, is_approved, verification_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const viewerCanVouch =
    viewer?.is_approved === true || viewer?.verification_status === "verified";
  if (!viewerCanVouch) {
    return NextResponse.json({ candidates: [], hidden_ids: [] });
  }

  const isAdminViewer = viewer?.is_admin === true;
  const { data: dismissals, error: dismissalsError } = isAdminViewer
    ? { data: [], error: null }
    : await adminClient
        .from("profile_vouch_dismissals")
        .select("vouchee_user_id")
        .eq("viewer_user_id", user.id);

  if (dismissalsError) {
    return NextResponse.json({ error: dismissalsError.message }, { status: 500 });
  }

  const dismissedIds = new Set(
    (dismissals ?? []).map((d: { vouchee_user_id: string }) => d.vouchee_user_id),
  );

  const { data: pendingRows, error: pendingError } = await adminClient
    .from("profiles")
    .select(
      "user_id, first_name, last_name, display_name, name, photo_url, service, company_name, account_type, email_verified, verification_status, created_at, is_pure_admin",
    )
    .eq("email_verified", true)
    .in("verification_status", VOUCHABLE_STATUSES)
    .eq("account_type", "member")
    .neq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(CANDIDATE_POOL_LIMIT);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  const candidates = ((pendingRows ?? []) as PendingProfileRow[])
    .filter((row) => !dismissedIds.has(row.user_id))
    .filter((row) => isSignupProfileComplete(row))
    .slice(0, RESPONSE_LIMIT);

  const pendingIds = candidates.map((row) => row.user_id);
  if (pendingIds.length === 0) {
    return NextResponse.json({ candidates: [], hidden_ids: [...dismissedIds] });
  }

  const [{ data: allVouches, error: allVouchesError }, { data: myVouches, error: myVouchesError }] =
    await Promise.all([
      adminClient
        .from("profile_vouches")
        .select("vouchee_user_id, voucher_user_id")
        .in("vouchee_user_id", pendingIds),
      adminClient
        .from("profile_vouches")
        .select("vouchee_user_id")
        .in("vouchee_user_id", pendingIds)
        .eq("voucher_user_id", user.id),
    ]);

  if (allVouchesError || myVouchesError) {
    return NextResponse.json(
      { error: allVouchesError?.message ?? myVouchesError?.message ?? "Could not load vouches" },
      { status: 500 },
    );
  }

  const voucherIds = Array.from(
    new Set(((allVouches ?? []) as VouchRow[]).map((v) => v.voucher_user_id).filter(Boolean)),
  );

  const { data: voucherProfiles } = voucherIds.length
    ? await adminClient
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, photo_url")
        .in("user_id", voucherIds)
    : { data: [] };

  const voucherProfileMap = new Map<string, VoucherProfileRow>();
  for (const profile of (voucherProfiles ?? []) as VoucherProfileRow[]) {
    voucherProfileMap.set(profile.user_id, profile);
  }

  const vouchCountMap = new Map<string, number>();
  const voucherMap = new Map<string, Array<{ user_id: string; name: string; photo_url: string | null }>>();
  for (const vouch of (allVouches ?? []) as VouchRow[]) {
    vouchCountMap.set(vouch.vouchee_user_id, (vouchCountMap.get(vouch.vouchee_user_id) ?? 0) + 1);
    const voucher = voucherProfileMap.get(vouch.voucher_user_id);
    if (!voucher) continue;
    const current = voucherMap.get(vouch.vouchee_user_id) ?? [];
    current.push({
      user_id: voucher.user_id,
      name: displayName(voucher),
      photo_url: voucher.photo_url ?? null,
    });
    voucherMap.set(vouch.vouchee_user_id, current);
  }

  const myVouchedSet = new Set(
    ((myVouches ?? []) as Array<{ vouchee_user_id: string }>).map((v) => v.vouchee_user_id),
  );

  return NextResponse.json({
    hidden_ids: [...dismissedIds],
    candidates: candidates.map((candidate) => ({
      user_id: candidate.user_id,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      display_name: candidate.display_name ?? candidate.name ?? null,
      photo_url: candidate.photo_url,
      service: candidate.service,
      vouch_count: vouchCountMap.get(candidate.user_id) ?? 0,
      user_vouched: myVouchedSet.has(candidate.user_id),
      vouchers: voucherMap.get(candidate.user_id) ?? [],
    })),
  });
}
