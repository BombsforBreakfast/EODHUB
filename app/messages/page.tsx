import { redirect } from "next/navigation";

/** @deprecated Use `/sidebar`. Kept so old links and bookmarks keep working. */
export default function LegacyMessagesRedirect() {
  redirect("/sidebar");
}
