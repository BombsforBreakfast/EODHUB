import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  collectIdentityProviders,
  createSupabaseServiceRoleClient,
  findAuthUsersByEmail,
} from "../../lib/auth/adminAuthLookup";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
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
  if (!user?.email) return NextResponse.json({ hasDuplicate: false });

  const { client, error } = createSupabaseServiceRoleClient();
  if (error === "missing_env") {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const normalized = user.email.toLowerCase();
  const { users: sameEmail, listError } = await findAuthUsersByEmail(client!, normalized);
  if (listError) {
    return NextResponse.json({ error: listError }, { status: 503 });
  }

  const others = sameEmail.filter((u) => u.id !== user.id);
  if (others.length === 0) return NextResponse.json({ hasDuplicate: false });

  const provSet = new Set<string>();
  for (const u of others) {
    for (const p of collectIdentityProviders(u)) provSet.add(p);
  }

  return NextResponse.json({
    hasDuplicate: true,
    duplicateProviders: [...provSet].sort(),
  });
}
