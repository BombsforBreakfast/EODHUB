import { strict as assert } from "node:assert";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { promotionInput, PROMOTION_PACKAGES, PROMOTION_IMAGE_LIMIT } from "../app/lib/promotions";
import { getNotificationHref } from "../app/lib/notificationNavigation";

const input = { id: randomUUID(), package: "Featured", name: "Example Customer", email: "example@example.com", phone: "+1 555 010 1000", business: "", promotionType: "Training or event", description: "A training event for the EOD community with a flyer.", destination: "https://example.com/event", timing: "Next month", consent: true };
test("captures each package with the full customer brief", () => {
  for (const pkg of PROMOTION_PACKAGES) assert.equal(promotionInput.parse({ ...input, package: pkg }).package, pkg);
  assert.equal(promotionInput.parse({ ...input, description: "A".repeat(12000) }).description.length, 12000);
  assert.equal(PROMOTION_IMAGE_LIMIT, 3145728);
});
test("rejects malformed, unsafe and oversized submissions", () => {
  for (const bad of [{ package: "Unknown" }, { id: "wrong" }, { email: "wrong" }, { phone: "1" }, { description: "Too short" }, { description: "A".repeat(12001) }, { consent: false }, { destination: "javascript:alert(1)" }, { website: "spam" }]) {
    assert.equal(promotionInput.safeParse({ ...input, ...bad }).success, false, JSON.stringify(bad).slice(0,80));
  }
});
test("name, email and description are required even when the browser is bypassed", () => {
  for (const field of ["name", "email", "description"] as const) {
    for (const value of [undefined, "", "   "]) {
      assert.equal(promotionInput.safeParse({ ...input, [field]: value }).success, false, `${field} must be provided`);
    }
  }
});
test("phone can be blank or omitted, but a supplied number is validated", () => {
  for (const value of [undefined, "", "   "]) assert.equal(promotionInput.parse({ ...input, phone: value }).phone, "");
  assert.equal(promotionInput.parse({ ...input, phone: " +1 555 010 1000 " }).phone, "+1 555 010 1000");
  for (const value of ["1", "x".repeat(41), null]) assert.equal(promotionInput.safeParse({ ...input, phone: value }).success, false);
});
test("bell notification opens the phone-friendly request review", () => {
  const id = randomUUID();
  assert.equal(getNotificationHref({ message: "Promotion to review", post_owner_id: null, type: "promotion_request", link: `/admin/promotions?request=${id}` }, { currentUserId: "admin", isAdmin: true }), `/admin/promotions?request=${id}`);
});
