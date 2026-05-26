import { NextRequest, NextResponse } from "next/server";
import {
  buildPlankHolderResponse,
  requirePlankHolderUser,
} from "@/app/lib/server/plankHolderChallenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePlankHolderUser(req);
    if (auth instanceof NextResponse) return auth;

    const response = await buildPlankHolderResponse(auth.admin, auth.user.id);
    return NextResponse.json(response);
  } catch (error) {
    console.error("plank-holder/check-award:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not check challenge progress." },
      { status: 500 },
    );
  }
}
