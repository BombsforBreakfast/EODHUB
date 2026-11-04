import type { NextRequest } from "next/server";
import { accountActor,accountFailure,accountJson,checkAccountDb } from "@/app/lib/account/server";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{
  const {db,user}=await accountActor(request);
  const result=await db.from("profiles").select("*").eq("user_id",user.id).maybeSingle();checkAccountDb(result.error);
  const vouches=await db.from("profile_vouches").select("id",{count:"exact",head:true}).eq("vouchee_user_id",user.id);checkAccountDb(vouches.error);
  return accountJson({profile:result.data,vouchCount:vouches.count??0});
}catch(error){return accountFailure(error);}}
