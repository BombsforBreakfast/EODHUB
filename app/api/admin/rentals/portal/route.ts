import type { NextRequest } from "next/server";
import { z } from "zod";
import { rentalAdministrator, rentalBody, rentalFailure, rentalJson, ensureSameOrigin, RentalError, checkDb } from "@/app/lib/rentals/portal.server";
import { approveRentalProperty, rentalBillingReady } from "@/app/lib/rentals/billing.server";
import { listingHasPaidAccess } from "@/app/lib/rentals/provider";
import { rentalEmail } from "@/app/lib/rentals/notifications.server";
import { queueBillingEmail, drainBillingEmails } from "@/app/lib/rentals/billing-notifications.server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { db } = await rentalAdministrator(request);
    const [providers, properties, campaigns, billing, emails] = await Promise.all([
      db.from("rental_providers").select("user_id,full_name,email,phone,company,status,email_verified_at,commitment_at,commitment_version,review_note,created_at").order("created_at", { ascending: false }).limit(1000),
      db.from("rental_properties").select("*").order("created_at", { ascending: false }).limit(1000),
      db.from("rental_campaigns").select("*").order("created_at", { ascending: false }).limit(1000),
      db.from("rental_billing_cases").select("*").order("opened_at",{ascending:false}).limit(1000),
      db.from("rental_billing_emails").select("id,subject,attempts,created_at,next_attempt_at").is("sent_at",null).order("created_at").limit(100),
    ]); checkDb(providers.error); checkDb(properties.error); checkDb(campaigns.error);checkDb(billing.error);checkDb(emails.error);
    const paths = [...new Set((properties.data ?? []).flatMap(p => p.submitted?.photos ?? []).concat((campaigns.data ?? []).flatMap(c => [c.flyer_path,c.report_path].filter(Boolean))))] as string[];
    const signed = paths.length ? await db.storage.from("rental-assets").createSignedUrls(paths, 3600) : { data: [], error: null }; checkDb(signed.error);
    return rentalJson({ providers: providers.data, properties: properties.data, campaigns: campaigns.data, billing:billing.data, pendingEmails:emails.data, urls: Object.fromEntries((signed.data ?? []).filter(p => p.path && p.signedUrl).map(p => [p.path,p.signedUrl])) });
  } catch (error) { return rentalFailure(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const { db, user } = await rentalAdministrator(request), body = await rentalBody(request, 30000);
    const id = z.uuid().parse(body.id), note = z.string().trim().max(2000).parse(body.note ?? "");
    if(body.action === "resolve_billing"){
      if(!note)throw new RentalError("Record the review outcome before resolving this billing case.");
      const {data:issue,error}=await db.from("rental_billing_cases").select("*").eq("id",id).single();checkDb(error);
      if(!issue)throw new RentalError("Billing case not found.",404);
      if(["payment_failed","payment_stopped","term_ended"].includes(issue.kind))throw new RentalError("Payment cases resolve when the customer pays or renews and collection resumes. Use Stripe to review billing; do not mark unpaid fees as paid.");
      checkDb((await db.from("rental_billing_cases").update({status:"resolved",note,resolved_at:new Date().toISOString(),reviewed_by:user.id}).eq("id",id)).error);
      checkDb((await db.rpc("rental_refresh_billing_hold",{p_property:issue.property_id})).error);
      const {data:provider,error:providerError}=await db.from("rental_providers").select("email").eq("user_id",issue.provider_id).single();checkDb(providerError);
      if(!provider)throw new RentalError("Billing provider not found.",503);
      await queueBillingEmail(db,`review-resolved:${issue.id}`,provider.email,"Billing review completed",`Your billing review has been completed.\n\n${note}\n\nOpen the property portal to check listing status. If the subscription ended during review, submit a new term through the cart to resume.`);
      await drainBillingEmails(db);
    } else if (body.action === "provider") {
      const status = z.enum(["approved","rejected","suspended"]).parse(body.status);
      const { data: provider } = await db.from("rental_providers").select("*").eq("user_id", id).maybeSingle();
      if (!provider) throw new RentalError("Provider not found.", 404);
      if (status === "approved" && !provider.email_verified_at) throw new RentalError("The provider must verify their email first.");
      if (status !== "approved" && !note) throw new RentalError("Add a reason for the provider.");
      checkDb((await db.from("rental_providers").update({ status, review_note: note || null, reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq("user_id", id)).error);
      await rentalEmail(provider.email, status === "approved" ? "Provider account approved" : "Provider account update", status === "approved" ? "Your EOD-HUB Rentals account is approved. Sign in to add properties. This approval grants access to the rental portal only." : note);
    } else if (body.action === "review") {
      const decision = z.enum(["approved","changes_requested","rejected"]).parse(body.status);
      const { data: property } = await db.from("rental_properties").select("*").eq("id", id).maybeSingle();
      if (!property || !property.submitted || !["pending","approved"].includes(property.review_status)) throw new RentalError("This property has no submitted version to review.");
      if (body.submissionId !== property.submission_id) throw new RentalError("This submission has changed. Refresh before approving.", 409);
      const { data: provider } = await db.from("rental_providers").select("*").eq("user_id", property.provider_id).single();
      if (!provider) throw new RentalError("Provider not found.");
      if (decision === "approved") {
        if (provider.status !== "approved") throw new RentalError("Approve the provider first.");
        if (!(property.published && listingHasPaidAccess(property)) && !rentalBillingReady()) throw new RentalError("Live listing billing must be configured before approving charges.",503);
        const claimed = await db.from("rental_properties").update({ review_status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq("id", id).eq("submission_id", property.submission_id).eq("review_status", property.review_status).select("id");
        checkDb(claimed.error); if (claimed.data?.length !== 1) throw new RentalError("This review changed. Refresh before approving.", 409);
        await approveRentalProperty(db, { ...property, review_status: "approved" }, provider);
      } else {
        if (!note) throw new RentalError("Add the changes or rejection reason.");
        const claimed = await db.from("rental_properties").update({ review_status: decision, review_note: note, reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq("id", id).eq("submission_id", property.submission_id).eq("review_status", "pending").select("id");
        checkDb(claimed.error); if (claimed.data?.length !== 1) throw new RentalError("This submission has already been reviewed. Refresh first.", 409);
        await rentalEmail(provider.email, decision === "changes_requested" ? "Property changes requested" : "Property submission declined", note);
      }
    } else if (body.action === "visibility") {
      checkDb((await db.from("rental_properties").update({ hidden: z.boolean().parse(body.hidden) }).eq("id", id)).error);
    } else if (body.action === "campaign") {
      const { data: campaign } = await db.from("rental_campaigns").select("*").eq("id", id).single();
      if (!campaign?.paid) throw new RentalError("Campaign payment has not succeeded.");
      const status = z.enum(["queued","live","report_due","completed"]).parse(body.status);
      if (campaign.starts_at && status === "queued") throw new RentalError("A started campaign cannot return to the queue.");
      if (status === "report_due" && (!campaign.ends_at || Date.parse(campaign.ends_at) > Date.now())) throw new RentalError("The campaign has not reached 30 days yet.");
      const url = (value: unknown, domain: string) => { const s = z.string().max(2000).parse(value ?? ""); if (s) { const u = new URL(s); if (u.protocol !== "https:" || !(u.hostname === domain || u.hostname.endsWith(`.${domain}`))) throw new RentalError(`Use an https ${domain} link.`); } return s; };
      const facebook = url(body.facebookUrl,"facebook.com"), instagram = url(body.instagramUrl,"instagram.com");
      const report = z.string().max(15000).parse(body.report ?? ""), storyNotes = z.string().max(2000).parse(body.storyNotes ?? "");
      if (status === "live" && (!facebook || !instagram || !campaign.flyer_path || !storyNotes)) throw new RentalError("Upload the flyer, add both post links, and record Stories delivery before starting the 30-day campaign.");
      if (status === "completed" && (!report && !campaign.report_path)) throw new RentalError("Add the final report before completing the campaign.");
      if (status === "completed" && (!campaign.ends_at || Date.parse(campaign.ends_at) > Date.now())) throw new RentalError("Complete the full 30-day campaign before marking it completed.");
      const starts = campaign.starts_at ?? (status === "live" ? new Date().toISOString() : null);
      const metrics = z.record(z.string().max(80), z.number().nonnegative()).parse(body.metrics ?? campaign.metrics);
      checkDb((await db.from("rental_campaigns").update({ status, facebook_url: facebook, instagram_url: instagram, story_notes: storyNotes, report, metrics, starts_at: starts, ends_at: starts ? new Date(Date.parse(starts) + 30 * 86400000).toISOString() : null }).eq("id", id)).error);
      const { data: provider } = await db.from("rental_providers").select("email").eq("user_id", campaign.provider_id).single();
      if (provider && status !== campaign.status) await rentalEmail(provider.email, status === "completed" ? "Campaign report ready" : "Campaign update", status === "completed" ? "Your 30-day campaign is complete. View the performance report in your property portal." : "Your rental campaign status has been updated. View the flyer, post links, and campaign dates in your portal.");
    } else throw new RentalError("Unknown review action.");
    return rentalJson({ ok: true });
  } catch (error) { return rentalFailure(error); }
}
