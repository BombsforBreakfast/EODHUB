import { NextRequest, NextResponse } from "next/server";
import {
  markPlankHolderModalSeen,
  requirePlankHolderUser,
} from "@/app/lib/server/plankHolderChallenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePlankHolderUser(req);
    if (auth instanceof NextResponse) return auth;

    await markPlankHolderModalSeen(auth.admin, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("plank-holder/dismiss-modal:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not dismiss modal." },
      { status: 500 },
    );
  }
}
