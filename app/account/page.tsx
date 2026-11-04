import { notFound } from "next/navigation";
import { sharedAuthEnabled } from "@/app/lib/account/server";
import AccountHome from "./AccountHome";
export const dynamic="force-dynamic";
export const metadata={title:"Your account | EOD-HUB",robots:{index:false,follow:false}};
export default function AccountPage(){if(!sharedAuthEnabled())notFound();return <AccountHome/>;}
