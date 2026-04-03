import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== "string") return NextResponse.json({ provider: null });

  // Basic email format guard to prevent probing
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return NextResponse.json({ provider: null });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Use targeted search instead of dumping all users
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return NextResponse.json({ provider: null });

  const user = data.users.find(
    (u) => u.email?.toLowerCase() === normalized
  );

  if (!user) return NextResponse.json({ provider: null });

  const provider = user.identities?.[0]?.provider ?? "email";
  return NextResponse.json({ provider });
}
