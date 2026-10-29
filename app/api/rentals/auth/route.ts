import type { NextRequest } from "next/server";
import { signupSchema, rentalSignupAttributes } from "@/app/lib/rentals/provider";
import { rentalBody, rentalDatabase, rentalFailure, rentalJson, rentalLimit, RentalError, ensureSameOrigin, checkDb } from "@/app/lib/rentals/portal.server";
import { sendRentalSignInLink } from "@/app/lib/rentals/passwordless.server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const body = await rentalBody(request, 12000), db = rentalDatabase();
    await rentalLimit(db, request, `rental-auth:${String(body.action).slice(0,30)}`, body.action === "signup" ? 3 : 12);
    if (body.action === "signup") {
      const input = signupSchema.parse(body);
      const email = validateEmailForRegistration(input.email);
      if (!email.ok) throw new RentalError("Use a valid, permanent email address.");
      const { data, error } = await db.auth.admin.createUser(rentalSignupAttributes({...input,email:email.email}));
      if (error || !data.user) throw new RentalError("Could not create this rental account. If this email already has a Hub account, use a different email for your separate rental account.", 409);
      const sent = await sendRentalSignInLink(db, data.user.id, email.email);
      return rentalJson({ ok: true, message: sent ? "Account created. Check your email for a secure sign-in link. We’ll review your account after you confirm your email." : "Account created, but the sign-in email could not be sent. Please request another sign-in link." });
    }
    if (body.action === "login") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new RentalError("Enter a valid email address.");
      const { data: provider, error } = await db.from("rental_providers").select("user_id,email").eq("email", email).maybeSingle();
      checkDb(error);
      if (provider) await sendRentalSignInLink(db, provider.user_id, provider.email);
      return rentalJson({ ok: true, message: "If a matching rental account exists, a secure sign-in link has been sent. Check your inbox and spam folder." });
    }
    throw new RentalError("Unknown account action.");
  } catch (error) { return rentalFailure(error); }
}
