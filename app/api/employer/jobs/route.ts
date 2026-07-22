import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const JOB_CATEGORIES = new Set(["EOD", "UXO", "Bomb Squad", "Other"]);

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

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function asOptionalString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userClient = getUserClient(token);
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = getAdminClient();
  const { data: profile, error: profileErr } = await adminClient
    .from("profiles")
    .select("user_id, is_employer, company_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message || "Failed to load profile" }, { status: 500 });
  }
  if (!profile?.is_employer) {
    return NextResponse.json({ error: "Only verified employers can post jobs this way." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = asOptionalString(body.title, 300);
  if (!title) {
    return NextResponse.json({ error: "Job title is required." }, { status: 400 });
  }

  const companyFromBody = asOptionalString(body.company_name ?? body.companyName, 200);
  const companyName = companyFromBody || asOptionalString(profile.company_name, 200) || "Employer";

  const categoryRaw = asOptionalString(body.category, 40) || "EOD";
  const category = JOB_CATEGORIES.has(categoryRaw) ? categoryRaw : "Other";

  const location = asOptionalString(body.location, 200) || "";
  const description = asOptionalString(body.description, 20000) || "";

  const applyUrlRaw = asOptionalString(body.apply_url ?? body.applyUrl, 2000) || "";
  const applyUrl = applyUrlRaw ? normalizeUrl(applyUrlRaw) : "";
  if (applyUrl && !isValidHttpUrl(applyUrl)) {
    return NextResponse.json({ error: "Apply URL must be a valid http(s) link." }, { status: 400 });
  }

  const ogTitle = asOptionalString(body.og_title ?? body.ogTitle, 300);
  const ogDescription = asOptionalString(body.og_description ?? body.ogDescription, 2000);
  const ogImage = asOptionalString(body.og_image ?? body.ogImage, 2000);
  const ogSiteName = asOptionalString(body.og_site_name ?? body.ogSiteName, 200);
  const payMin = asOptionalNumber(body.pay_min ?? body.payMin);
  const payMax = asOptionalNumber(body.pay_max ?? body.payMax);

  const { data: job, error: jobErr } = await adminClient
    .from("jobs")
    .insert({
      title,
      company_name: companyName,
      category,
      location,
      apply_url: applyUrl || null,
      description,
      is_approved: true,
      is_rejected: false,
      source_type: "community",
      user_id: user.id,
      anonymous: false,
      og_title: ogTitle,
      og_description: ogDescription,
      og_image: ogImage,
      og_site_name: ogSiteName,
      pay_min: payMin,
      pay_max: payMax,
    })
    .select("id, title, company_name, location, category, description, apply_url, og_title, og_description, og_image, og_site_name")
    .maybeSingle();

  if (jobErr || !job?.id) {
    return NextResponse.json({ error: jobErr?.message || "Failed to create job" }, { status: 500 });
  }

  const postTitle = job.og_title || job.title || title;
  const postCompany = job.company_name || job.og_site_name || companyName;
  const postLocation = job.location?.trim() || null;
  const postDescription =
    job.og_description ||
    job.description ||
    [postCompany, postLocation, job.category].filter(Boolean).join(" · ") ||
    null;
  const postOgUrl = job.apply_url || null;

  const { data: post, error: postErr } = await adminClient
    .from("posts")
    .insert({
      user_id: user.id,
      post_as_user_id: user.id,
      wall_user_id: null,
      content: `We're hiring: ${postTitle}`,
      content_type: "job_post",
      system_generated: false,
      image_url: null,
      gif_url: null,
      og_url: postOgUrl,
      og_title: postTitle,
      og_description: postDescription,
      og_image: job.og_image,
      og_site_name: job.og_site_name || postCompany || "Jobs",
    })
    .select("id")
    .maybeSingle();

  if (postErr || !post?.id) {
    await adminClient.from("jobs").delete().eq("id", job.id);
    return NextResponse.json({ error: postErr?.message || "Failed to create feed post" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    postId: post.id,
  });
}
