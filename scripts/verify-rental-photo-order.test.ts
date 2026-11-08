import assert from "node:assert/strict";
import { test } from "node:test";
import { reorderRentalPhotos } from "../app/lib/rentals/photoOrder";

test("reordering a rental photo changes the cover and keeps every other photo in relative order",()=>{
  const original=["first","second","third","fourth"];
  assert.deepEqual(reorderRentalPhotos(original,"third","first"),["third","first","second","fourth"]);
  assert.deepEqual(reorderRentalPhotos(original,"first","fourth"),["second","third","fourth","first"]);
  assert.deepEqual(original,["first","second","third","fourth"]);
});
test("canceled, same-position and stale drops retain the existing order",()=>{
  const original=["first","second"];
  for(const [source,target] of [["first",null],["first","first"],["missing","second"],["first","missing"]])assert.equal(reorderRentalPhotos(original,source!,target),original);
});
test("a full 100-photo listing can move a photo without dropping or duplicating any paths",()=>{
  const photos=Array.from({length:100},(_,i)=>`photo-${i}`);
  const moved=reorderRentalPhotos(photos,"photo-99","photo-0");
  assert.equal(moved[0],"photo-99");assert.equal(moved.length,100);assert.equal(new Set(moved).size,100);
  assert.deepEqual(moved.slice(1),photos.slice(0,-1));
});
