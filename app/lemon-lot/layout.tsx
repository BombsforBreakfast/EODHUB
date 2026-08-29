import { redirect } from "next/navigation";
import MasterShell from "../components/master/MasterShell";
import { PRODUCT_FEATURE_FLAGS } from "../lib/productFeatureFlags";

export default function LemonLotLayout({ children }: { children: React.ReactNode }) {
  if (!PRODUCT_FEATURE_FLAGS.lemonLotEnabled) {
    redirect("/");
  }

  return <MasterShell>{children}</MasterShell>;
}
