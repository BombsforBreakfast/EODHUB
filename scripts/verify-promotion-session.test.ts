import assert from "node:assert/strict";
import test from "node:test";
import { createPromotionSession, isPromotionSession, promotionOwner, promotionSource } from "../app/lib/server/promotionSession";

test("public visitors receive independent opaque draft sessions without a password", () => {
  const first = createPromotionSession(), second = createPromotionSession();
  assert.equal(isPromotionSession(first), true);
  assert.equal(isPromotionSession(second), true);
  assert.notEqual(first, second);
  assert.notEqual(promotionOwner(first), promotionOwner(second));
  assert.equal(promotionOwner(first).length, 64);
});
test("missing and malformed sessions are not used for draft ownership", () => {
  for (const token of [undefined, "", "true", "password", "a".repeat(63), "a".repeat(65), "G".repeat(64), `${"a".repeat(64)}\n`]) assert.equal(isPromotionSession(token), false);
});
test("persistent source quotas do not store raw network addresses or depend on browser sessions", () => {
  const source = promotionSource("192.0.2.1", "test-only-service-secret");
  assert.equal(source.length, 64);
  assert.equal(source, promotionSource("192.0.2.1", "test-only-service-secret"));
  assert.equal(source.includes("192.0.2.1"), false);
  assert.notEqual(source, promotionSource("192.0.2.2", "test-only-service-secret"));
  assert.notEqual(source, promotionSource("192.0.2.1", "another-test-secret"));
  assert.throws(() => promotionSource("192.0.2.1", ""));
});
