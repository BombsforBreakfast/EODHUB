import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ provider: null });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) return NextResponse.json({ provider: null });

  const user = data.users.find(
    (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
  );

  if (!user) return NextResponse.json({ provider: null });

  // Check identities for provider
  const provider = user.identities?.[0]?.provider ?? "email";
  return NextResponse.json({ provider });
}
