import { notFound } from "next/navigation";
import AdminInviteSignupClient from "./AdminInviteSignupClient";

export const dynamic = "force-dynamic";

export default async function AdminInviteSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  const secret = process.env.ADMIN_SIGNUP_SECRET;
  if (!secret) notFound();

  const { k } = await searchParams;
  if (!k || k !== secret) notFound();

  return <AdminInviteSignupClient />;
}
