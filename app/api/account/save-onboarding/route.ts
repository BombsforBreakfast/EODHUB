import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isOAuthOnlyGoogleUser } from "@/app/lib/verificationAccess";
import { ensureProfileStubForUser } from "@/app/lib/auth/ensureProfileStub";
import { VERIFICATION } from "@/app/lib/verificationStatus";
import {
  validateEmployerOnboardingInput,
  validateMemberOnboardingInput,
} from "@/app/lib/profileCompleteness";
import { createNotification } from "@/app/lib/notificationsServer";
import {
  lookupReferrerByCode,
  referrerDisplayName,
} from "@/app/lib/referralReferrer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OnboardingBody = {
  accountType?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  service?: unknown;
  status?: unknown;
  skillBadge?: unknown;
  yearsExperience?: unknown;
  companyName?: unknown;
  referralInput?: unknown;
  photoUrl?: unknown;
};

export async function POST(req: NextRequest) {
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

  let body: OnboardingBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const accountType = body.accountType === "employer" ? "employer" : body.accountType === "member" ? "member" : null;
  if (!accountType) {
    return NextResponse.json({ error: "Account type is required." }, { status: 400 });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName : "";
  const lastName = typeof body.lastName === "string" ? body.lastName : "";
  const service = typeof body.service === "string" ? body.service : "";
  const status = typeof body.status === "string" ? body.status : "";
  const skillBadge = typeof body.skillBadge === "string" ? body.skillBadge : "";
  const yearsExperience = typeof body.yearsExperience === "string" ? body.yearsExperience : "";
  const companyName = typeof body.companyName === "string" ? body.companyName : "";
  const referralInput = typeof body.referralInput === "string" ? body.referralInput.trim().toUpperCase() : "";
  const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";

  const validationError =
    accountType === "member"
      ? validateMemberOnboardingInput({ firstName, lastName, service, status })
      : validateEmployerOnboardingInput({ firstName, lastName, companyName });

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.user.id;
  const isGoogle = isOAuthOnlyGoogleUser(authData.user);
  const authEmail = authData.user.email?.trim().toLowerCase() ?? "";

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (authEmail) {
    const stub = await ensureProfileStubForUser(adminClient, userId, authEmail);
    if (!stub.ok) {
      return NextResponse.json({ error: "Could not initialize profile" }, { status: 500 });
    }
  }

  const { data: existingProfile, error: profileReadError } = await adminClient
    .from("profiles")
    .select("must_complete_onboarding, is_pure_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileReadError) {
    return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
  }

  const wasProvisioned = existingProfile?.must_complete_onboarding === true;

  const verificationFields = wasProvisioned
    ? {
        verification_status: VERIFICATION.VERIFIED,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        admin_verified: true,
        is_approved: true,
      }
    : isGoogle
      ? {
          verification_status: VERIFICATION.AWAITING_ADMIN,
          email_verified: true,
          email_verified_at: new Date().toISOString(),
          admin_verified: false,
          is_approved: false,
        }
      : {
          verification_status: VERIFICATION.AWAITING_EMAIL,
          email_verified: false,
          email_verified_at: null,
          admin_verified: false,
          is_approved: false,
        };

  const updates =
    accountType === "member"
      ? {
          account_type: "member" as const,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          service,
          status,
          skill_badge: skillBadge || null,
          years_experience: yearsExperience || null,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          ...verificationFields,
        }
      : {
          account_type: "employer" as const,
          is_employer: true,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          company_name: companyName.trim(),
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          ...verificationFields,
        };

  let verifiedReferrer: Awaited<ReturnType<typeof lookupReferrerByCode>> = null;
  if (referralInput) {
    verifiedReferrer = await lookupReferrerByCode(adminClient, referralInput);
  }

  const finalUpdates = referralInput
    ? {
        ...updates,
        referred_by: referralInput,
        ...(verifiedReferrer ? { referrer_user_id: verifiedReferrer.user_id } : {}),
      }
    : updates;

  const { error: updateError } = await adminClient
    .from("profiles")
    .update(finalUpdates)
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: "Error saving profile", detail: updateError.message },
      { status: 500 },
    );
  }

  // Auto-vouch: when a referred member signs up, the referring user
  // automatically casts 1 of the 3 community vouches needed to verify them.
  // Two additional vouches (or admin approval) are still required.
  let autoVouched = false;
  if (verifiedReferrer && accountType === "member" && !wasProvisioned) {
    autoVouched = await applyReferralAutoVouch(adminClient, {
      newUserId: userId,
      referrer: verifiedReferrer,
    });
  }

  return NextResponse.json({
    success: true,
    verification_status: verificationFields.verification_status,
    wasProvisioned,
    isGoogle,
    autoVouched,
  });
}

type AutoVouchArgs = {
  newUserId: string;
  referrer: NonNullable<Awaited<ReturnType<typeof lookupReferrerByCode>>>;
};

async function applyReferralAutoVouch(
  adminClient: SupabaseClient,
  { newUserId, referrer }: AutoVouchArgs,
): Promise<boolean> {
  try {
    if (referrer.user_id === newUserId) return false;

    const { error: vouchError } = await adminClient
      .from("profile_vouches")
      .upsert(
        { vouchee_user_id: newUserId, voucher_user_id: referrer.user_id },
        { onConflict: "vouchee_user_id,voucher_user_id" },
      );

    if (vouchError) {
      console.error("save-onboarding referral auto-vouch insert failed:", vouchError.message);
      return false;
    }

    const referrerName = referrerDisplayName(referrer);

    try {
      await createNotification(adminClient, {
        recipientUserId: newUserId,
        actorUserId: referrer.user_id,
        actorName: referrerName,
        type: "user_verified",
        category: "system",
        message: `${referrerName} vouched for you when you signed up with their invite — 1 of 3 votes already in.`,
        link: `/profile/${encodeURIComponent(newUserId)}`,
        groupKey: `user:${newUserId}:verification`,
        dedupeKey: `referral_auto_vouch:${newUserId}`,
        metadata: { vouchee_user_id: newUserId, voucher_user_id: referrer.user_id, source: "referral" },
      });
    } catch (notifyErr) {
      const msg = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      console.error("save-onboarding referral auto-vouch notify failed:", msg);
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("save-onboarding referral auto-vouch failed:", msg);
    return false;
  }
}
