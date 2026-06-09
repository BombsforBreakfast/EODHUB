import { redirect } from "next/navigation";

/** Legacy URL — Bomb Suit Man lives at /games/bomb-suit-man. */
export default function RainbowCowboyLegacyRedirect() {
  redirect("/games/bomb-suit-man");
}
