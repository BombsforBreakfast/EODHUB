import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_EDIT_COLUMNS =
  "id, title, company_name, location, category, description, og_description, apply_url, pay_min, pay_max, clearance, is_approved, source_type";

type JobEditBody = {
  title?: unknown;
  company_name?: unknown;
  location?: unknown;
  category?: unknown;
  description?: unknown;
  apply_url?: unknown;
  pay_min?: unknown;
  pay_max?: unknown;
  clearance?: unknown;
};

async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
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

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: user.id };
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePay(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeEditPayload(body: JobEditBody): Record<string, unknown> | NextResponse {
  const payload: Record<string, unknown> = {};

  if ("title" in body) {
    const title = trimOrNull(body.title);
    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    payload.title = title;
  }

  if ("company_name" in body) payload.company_name = trimOrNull(body.company_name);
  if ("location" in body) payload.location = trimOrNull(body.location);
  if ("category" in body) payload.category = trimOrNull(body.category);
  if ("apply_url" in body) payload.apply_url = trimOrNull(body.apply_url);
  if ("clearance" in body) payload.clearance = trimOrNull(body.clearance);

  if ("description" in body) {
    const description = trimOrNull(body.description);
    if (!description) {
      return NextResponse.json({ error: "Description is required." }, { status: 400 });
    }
    payload.description = description;
    payload.og_description = description;
  }

  if ("pay_min" in body || "pay_max" in body) {
    const payMin = "pay_min" in body ? parsePay(body.pay_min) : undefined;
    const payMax = "pay_max" in body ? parsePay(body.pay_max) : undefined;
    if (payMin != null && payMax != null && payMin > payMax) {
      return NextResponse.json(
        { error: "Minimum pay cannot be greater than maximum pay." },
        { status: 400 },
      );
    }
    if ("pay_min" in body) payload.pay_min = payMin;
    if ("pay_max" in body) payload.pay_max = payMax;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  return payload;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { jobId } = await params;
  const id = (jobId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  let body: JobEditBody = {};
  try {
    body = (await req.json()) as JobEditBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = normalizeEditPayload(body);
  if (payload instanceof NextResponse) return payload;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: updated, error } = await adminClient
    .from("jobs")
    .update(payload)
    .eq("id", id)
    .neq("is_rejected", true)
    .select(JOB_EDIT_COLUMNS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job: updated });
}
