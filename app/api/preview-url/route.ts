import { NextRequest, NextResponse } from "next/server";
import { extractMetadata } from "@/app/lib/metadata/extractMetadata";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }
    const metadata = await extractMetadata(url);
    return NextResponse.json(metadata);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch preview" },
      { status: 500 }
    );
  }
}
