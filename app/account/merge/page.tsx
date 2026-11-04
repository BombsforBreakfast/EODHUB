import { notFound } from "next/navigation";
import { sharedAuthEnabled } from "@/app/lib/account/server";
import MergeRequest from "./MergeRequest";
export const dynamic="force-dynamic";
export const metadata={title:"Account merge review | EOD-HUB",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function Page(){if(!sharedAuthEnabled())notFound();return <MergeRequest/>;}
