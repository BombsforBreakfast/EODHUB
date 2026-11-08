import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import sharp from "sharp";
import { RENTAL_PHOTO_ORIGINAL_BYTES, RENTAL_PHOTO_UPLOAD_BYTES, prepareRentalPhoto, validateRentalPhoto } from "../app/lib/rentals/photoUpload";
import { RENTAL_PHOTO_STORAGE_BYTES, rentalPhotoForStorage } from "../app/lib/rentals/photoStorage";
import { readRentalResponse, rentalFetch } from "../app/lib/rentals/clientResponse";
import { rentalFieldErrors, rentalFieldStep } from "../app/lib/rentals/propertyCompletion";

test("accept large originals but reject oversized, empty and unsupported files before decode", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", ""]) {
    assert.doesNotThrow(() => validateRentalPhoto({name:"rental.jpg",size:RENTAL_PHOTO_ORIGINAL_BYTES,type}));
  }
  assert.throws(() => validateRentalPhoto({name:"large.jpg",size:RENTAL_PHOTO_ORIGINAL_BYTES+1,type:"image/jpeg"}), /20 MB/);
  assert.throws(() => validateRentalPhoto({name:"iphone.heic",size:5000,type:"image/heic"}), /Export HEIC/);
  assert.throws(() => validateRentalPhoto({name:"bad.jpg",size:0,type:"image/jpeg"}), /empty/);
  assert.throws(() => validateRentalPhoto({name:"bad.jpg",size:5000,type:"image/svg+xml"}), /JPG, PNG, or WebP/);
});

test("browser preparation uses JPEG, resizes a large photo and retries quality within the request budget", async t => {
  const saved = new Map(["Image", "document"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(() => {for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
  t.mock.method(URL,"createObjectURL",()=>"blob:test");
  let revoked=false; t.mock.method(URL,"revokeObjectURL",()=>{revoked=true;});
  Object.defineProperty(globalThis,"Image",{configurable:true,value:class {naturalWidth=6000;naturalHeight=4000;onload?:()=>void;set src(_:string){queueMicrotask(()=>this.onload?.());}}});
  const encoded: {width:number;height:number;quality:number}[]=[];
  const canvas={width:0,height:0,getContext:()=>({fillStyle:"",fillRect(){},drawImage(){}}),toBlob(callback:(b:Blob)=>void,type:string,quality:number){assert.equal(type,"image/jpeg");encoded.push({width:this.width,height:this.height,quality});callback(new Blob([new Uint8Array(quality>.85?4000000:500000)],{type}));}};
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>canvas}});
  const result=await prepareRentalPhoto(new File([new Uint8Array(8000000)],"large.png",{type:"image/png"}));
  assert.equal(result.type,"image/jpeg");assert.ok(result.size<=RENTAL_PHOTO_UPLOAD_BYTES);
  assert.deepEqual(encoded.map(v=>[v.width,v.height]),[[2400,1600],[2400,1600]]);
  assert.equal(revoked,true);assert.equal(canvas.width,0);
});

test("large real images become bounded WebP storage with no EXIF; corrupt and disguised inputs fail", async () => {
  const original=await sharp(randomBytes(3600*2400*3),{raw:{width:3600,height:2400,channels:3}}).jpeg({quality:99}).withMetadata().toBuffer();
  assert.ok(original.length>4000000);
  const optimized=await rentalPhotoForStorage(original),metadata=await sharp(optimized).metadata();
  assert.ok(optimized.length<=RENTAL_PHOTO_STORAGE_BYTES);assert.equal(metadata.format,"webp");
  assert.ok(metadata.width!<=2400);assert.ok(metadata.height!<=2400);assert.equal(metadata.exif,undefined);
  await assert.rejects(rentalPhotoForStorage(Buffer.from("not an image")));
  await assert.rejects(rentalPhotoForStorage(Buffer.from('<svg width="10" height="10"></svg>')), /Unsupported photo format/);
});

test("hosting failures and network errors produce helpful messages instead of JSON or browser exceptions", async t => {
  await assert.rejects(readRentalResponse(new Response("FUNCTION_PAYLOAD_TOO_LARGE",{status:413})),/resize/);
  await assert.rejects(readRentalResponse(new Response("<html>Unavailable</html>",{status:502})),/try again shortly/);
  await assert.rejects(readRentalResponse(new Response("",{status:200})),/incomplete response/);
  await assert.rejects(readRentalResponse(new Response('{"error":"This draft changed. Reload it."}',{status:409})),/This draft changed/);
  assert.deepEqual(await readRentalResponse(new Response('{"id":"saved"}')),{id:"saved"});
  t.mock.method(globalThis,"fetch",async()=>{throw new DOMException("The string did not match the expected pattern.","SyntaxError");});
  await assert.rejects(rentalFetch("/api/rentals/portal"),/Check your connection/);
});

test("form feedback identifies formats and numeric errors without technical schema messages", () => {
  const errors=rentalFieldErrors({zip:"abc",contactEmail:"not an email",rent:NaN,bedrooms:1.2,minimumLeaseMonths:8,description:"Too short"});
  assert.match(errors.zip,/ZIP code/);assert.match(errors.contactEmail,/valid email/);
  assert.match(errors.rent,/monthly rent/);assert.match(errors.bedrooms,/whole number/);
  assert.match(errors.minimumLeaseMonths,/9 to 120/);assert.match(errors.description,/40 to 6,000/);
  assert.ok(!Object.values(errors).join(" ").includes("undefined"));
  assert.equal(rentalFieldStep("zip"),0);assert.equal(rentalFieldStep("rent"),1);assert.equal(rentalFieldStep("photos"),2);assert.equal(rentalFieldStep("contactEmail"),3);
});
