import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  collectIdentityProviders,
  createSupabaseServiceRoleClient,
  findAuthUsersByEmail,
} from "../../lib/auth/adminAuthLookup";
import { buildLinkedAccountSummary, type ProfileRow } from "../../lib/auth/linkedAccountLabels";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ accounts: [], sameEmailCount: 0 });
  }

  const { client, error } = createSupabaseServiceRoleClient();
  if (error === "missing_env") {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const normalized = user.email.toLowerCase();
  const { users: sameEmail, listError } = await findAuthUsersByEmail(client!, normalized);
  if (listError) {
    return NextResponse.json({ error: listError }, { status: 503 });
  }

  const ids = sameEmail.map((u) => u.id);
  if (ids.length === 0) {
    return NextResponse.json({ accounts: [], sameEmailCount: 0 });
  }

  const { data: profileRows, error: profErr } = await client!
    .from("profiles")
    .select(
      "user_id, first_name, last_name, account_type, is_employer, company_name, service, verification_status, photo_url"
    )
    .in("user_id", ids);

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 503 });
  }

  const profileById = new Map<string, ProfileRow>();
  for (const row of (profileRows ?? []) as ProfileRow[]) {
    profileById.set(row.user_id, row);
  }

  const accounts = sameEmail.map((authUser) =>
    buildLinkedAccountSummary(
      authUser,
      profileById.get(authUser.id),
      authUser.id === user.id,
      collectIdentityProviders(authUser)
    )
  );

  accounts.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return a.label.localeCompare(b.label);
  });

  return NextResponse.json({
    accounts,
    sameEmailCount: sameEmail.length,
    canSwitch: sameEmail.length > 1,
  });
}
