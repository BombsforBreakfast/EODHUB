import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { accountActor,accountFailure,accountJson,accountWrite,AccountError,checkAccountDb } from "@/app/lib/account/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){try{
  accountWrite(request);const {db,user}=await accountActor(request);
  const profile=await db.from("profiles").select("user_id").eq("user_id",user.id).maybeSingle();checkAccountDb(profile.error);
  if(!profile.data)throw new AccountError("Start your Hub application before uploading files.",403);
  const reader=request.body?.getReader();if(!reader)throw new AccountError("Choose a file.");
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>9*1024*1024){await reader.cancel();throw new AccountError("Choose a file under 8 MB.",413);}chunks.push(result.value);}
  const form=await new Response(Buffer.concat(chunks),{headers:{"Content-Type":request.headers.get("content-type")??""}}).formData();
  const file=form.get("file"),kind=form.get("kind");
  if(!(file instanceof File)||!file.size||file.size>8*1024*1024||!["photo","certificate"].includes(String(kind)))throw new AccountError("Choose a supported file under 8 MB.");
  const source=Buffer.from(await file.arrayBuffer());let bytes:Buffer,path:string,contentType:string,bucket:string;
  if(kind==="certificate" && source.subarray(0,5).toString()==="%PDF-"){
    bytes=source;contentType="application/pdf";bucket="verification-docs";path=`${user.id}/eod-cert/${randomUUID()}.pdf`;
  }else{
    try{bytes=await sharp(source,{limitInputPixels:25000000}).rotate().resize({width:kind==="photo"?1024:2400,height:kind==="photo"?1024:2400,fit:"inside",withoutEnlargement:true}).jpeg({quality:88}).toBuffer();}catch{throw new AccountError("Choose a JPEG, PNG, WebP image or a PDF certificate.");}
    contentType="image/jpeg";bucket=kind==="photo"?"profile-photos":"verification-docs";path=`${user.id}/${kind==="photo"?"":"eod-cert/"}${randomUUID()}.jpg`;
  }
  const upload=await db.storage.from(bucket).upload(path,bytes,{contentType,upsert:false});checkAccountDb(upload.error);
  return accountJson({path,fileName:file.name,url:kind==="photo"?db.storage.from(bucket).getPublicUrl(path).data.publicUrl:undefined});
}catch(error){return accountFailure(error);}}
