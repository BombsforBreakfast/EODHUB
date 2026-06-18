import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  parsePostAsUserIdFromBody,
  POST_AS_ADMIN_EMAIL,
  validatePostAsUserIdForShare,
} from "@/app/lib/postAsIdentity";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function formatJobLocation(location: string | null): string | null {
  const trimmed = location?.trim();
  return trimmed ? trimmed : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userClient = getUserClient(token);
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shareText = typeof body?.content === "string" ? body.content.trim().slice(0, 4000) : "";
  const parsedPostAsUserId = parsePostAsUserIdFromBody(body);
  if (parsedPostAsUserId === "invalid") {
    return NextResponse.json({ error: "Invalid post-as identity." }, { status: 400 });
  }

  const adminClient = getAdminClient();
  const { data: adminProfile } = await adminClient
    .from("profiles")
    .select("user_id")
    .eq("email", POST_AS_ADMIN_EMAIL)
    .maybeSingle();

  const postAsValidation = validatePostAsUserIdForShare({
    callerEmail: user.email ?? null,
    callerUserId: user.id,
    requestedPostAsUserId: parsedPostAsUserId,
    adminUserId: adminProfile?.user_id ?? null,
  });
  if (!postAsValidation.ok) {
    return NextResponse.json({ error: postAsValidation.error }, { status: postAsValidation.status });
  }

  const { id: jobId } = await params;
  const { data: job, error: jobErr } = await adminClient
    .from("jobs")
    .select("id, title, company_name, location, category, description, apply_url, og_title, og_description, og_image, og_site_name, is_approved, is_rejected")
    .eq("id", jobId)
    .eq("is_approved", true)
    .neq("is_rejected", true)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const title = job.og_title || job.title || "Job listing";
  const company = job.company_name || job.og_site_name || null;
  const location = formatJobLocation(job.location);
  const description = job.og_description || job.description || [company, location, job.category].filter(Boolean).join(" · ") || null;
  const content = shareText || `Shared a job: ${title}`;

  const { data: inserted, error: insertErr } = await userClient
    .from("posts")
    .insert({
      user_id: user.id,
      post_as_user_id: postAsValidation.postAsUserId,
      wall_user_id: null,
      content,
      image_url: null,
      gif_url: null,
      og_url: job.apply_url,
      og_title: title,
      og_description: description,
      og_image: job.og_image,
      og_site_name: job.og_site_name || company || "Jobs",
    })
    .select("id")
    .maybeSingle();

  if (insertErr || !inserted?.id) {
    return NextResponse.json({ error: insertErr?.message || "Failed to share job" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    postId: inserted.id,
    jobId: job.id,
  });
}
