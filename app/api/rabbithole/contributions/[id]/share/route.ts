import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DestinationType = "feed" | "user_wall" | "unit_wall";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
  const destinationType = body?.destinationType as DestinationType | undefined;
  const destinationId = typeof body?.destinationId === "string" ? body.destinationId : null;
  const content = typeof body?.content === "string" ? body.content.trim() : "";

  if (!destinationType || !["feed", "user_wall", "unit_wall"].includes(destinationType)) {
    return NextResponse.json({ error: "Invalid destinationType" }, { status: 400 });
  }
  if ((destinationType === "user_wall" || destinationType === "unit_wall") && !destinationId) {
    return NextResponse.json({ error: "destinationId is required for this destination" }, { status: 400 });
  }

  const adminClient = getAdminClient();
  const { id: contributionId } = await params;
  const { data: contribution, error: contribErr } = await adminClient
    .from("rabbithole_contributions")
    .select("id, title, summary, source_url, source_domain, status")
    .eq("id", contributionId)
    .eq("status", "active")
    .maybeSingle();

  if (contribErr || !contribution) {
    return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
  }

  const finalContent = content || contribution.summary || null;
  const ogUrl = contribution.source_url ?? `/rabbithole/contribution/${contribution.id}`;
  const ogTitle = contribution.title ?? "RabbitHole contribution";
  const ogDescription = contribution.summary ?? null;
  const ogSiteName = contribution.source_domain ?? "RabbitHole";

  if (destinationType === "feed" || destinationType === "user_wall") {
    const wallUserId = destinationType === "user_wall" ? destinationId : null;
    const { data: inserted, error } = await adminClient
      .from("posts")
      .insert({
        user_id: user.id,
        wall_user_id: wallUserId,
        content: finalContent,
        image_url: null,
        gif_url: null,
        og_url: ogUrl,
        og_title: ogTitle,
        og_description: ogDescription,
        og_image: null,
        og_site_name: ogSiteName,
        rabbithole_contribution_id: contribution.id,
      })
      .select("id")
      .maybeSingle();

    if (error || !inserted?.id) {
      return NextResponse.json({ error: error?.message || "Failed to share post" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      destinationType,
      postId: inserted.id,
      wallUserId,
      contributionId: contribution.id,
    });
  }

  const { data: membership } = await adminClient
    .from("unit_members")
    .select("status")
    .eq("unit_id", destinationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.status !== "approved") {
    return NextResponse.json({ error: "You are not allowed to post to this group." }, { status: 403 });
  }

  const { data: unit } = await adminClient
    .from("units")
    .select("id, slug")
    .eq("id", destinationId)
    .maybeSingle();

  if (!unit?.id) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data: unitPost, error: unitErr } = await adminClient
    .from("unit_posts")
    .insert({
      unit_id: destinationId,
      user_id: user.id,
      post_type: "post",
      content: finalContent,
      photo_url: null,
      gif_url: null,
      rabbithole_contribution_id: contribution.id,
      meta: {
        rabbithole_contribution_id: contribution.id,
        og: {
          url: ogUrl,
          title: ogTitle,
          description: ogDescription,
          site_name: ogSiteName,
        },
      },
    })
    .select("id")
    .maybeSingle();

  if (unitErr || !unitPost?.id) {
    return NextResponse.json({ error: unitErr?.message || "Failed to share to group" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    destinationType,
    unitPostId: unitPost.id,
    unitSlug: unit.slug,
    contributionId: contribution.id,
  });
}
