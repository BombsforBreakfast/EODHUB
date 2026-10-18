import assert from "node:assert/strict";
import test from "node:test";
import { canShowAdminNavigation, isOwnerAdmin, OWNER_ADMIN_EMAIL, OWNER_ADMIN_USER_ID } from "../app/lib/ownerAdminAccess";

const owner = { userId: OWNER_ADMIN_USER_ID, email: OWNER_ADMIN_EMAIL, isAdmin: true };
test("native Admin visibility allows the verified owner account", () => {
  assert.equal(isOwnerAdmin(owner), true);
  assert.equal(canShowAdminNavigation({ ...owner, native: true }), true);
  assert.equal(isOwnerAdmin({ ...owner, email: OWNER_ADMIN_EMAIL.toUpperCase() }), true);
});
test("other admins, members, missing auth and copied owner email get no native Admin", () => {
  for (const viewer of [{}, { ...owner, userId: null }, { ...owner, userId: "different-account" },
    { ...owner, email: "other@example.com" }, { ...owner, isAdmin: false }, { ...owner, isAdmin: null }]) {
    assert.equal(isOwnerAdmin(viewer), false);
    assert.equal(canShowAdminNavigation({ ...viewer, native: true }), false);
  }
});
test("existing web admin permissions are preserved without admitting members", () => {
  assert.equal(canShowAdminNavigation({ userId: "other-admin", email: "admin@example.com", isAdmin: true, native: false }), true);
  assert.equal(canShowAdminNavigation({ ...owner, isAdmin: false, native: false }), false);
  assert.equal(canShowAdminNavigation({ native: false }), false);
});
test("switching away from the owner account immediately removes its exception", () => {
  assert.equal(canShowAdminNavigation({ ...owner, native: true }), true);
  assert.equal(canShowAdminNavigation({ ...owner, userId: "switched-account", native: true }), false);
});
