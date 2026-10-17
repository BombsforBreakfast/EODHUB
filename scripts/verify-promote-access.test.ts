import assert from "node:assert/strict";
import test from "node:test";
import { createPromoteAccessToken, hasPromoteAccess, matchesPromotePassword, PROMOTE_ACCESS_TTL_SECONDS } from "../app/lib/server/promoteAccess";

const password = "test-only-promotion-passphrase-3917";
const now = Date.UTC(2026, 9, 17, 12);

test("only the exact configured password unlocks the brochure", () => {
  assert.equal(matchesPromotePassword(password, password), true);
  for (const candidate of ["wrong", "", null, {}, `${password} `, password.toUpperCase(), "a".repeat(257)]) {
    assert.equal(matchesPromotePassword(candidate, password), false);
  }
});

test("missing and weak configuration fail closed", () => {
  for (const configuration of [undefined, "", "short", "x".repeat(257)]) {
    assert.equal(matchesPromotePassword(configuration, configuration), false);
    assert.equal(hasPromoteAccess("anything", configuration, now), false);
  }
  assert.throws(() => createPromoteAccessToken("short", now));
});

test("signed access expires at seven days and contains no password", () => {
  const token = createPromoteAccessToken(password, now);
  assert.equal(token.includes(password), false);
  assert.equal(hasPromoteAccess(token, password, now), true);
  assert.equal(hasPromoteAccess(token, password, now + PROMOTE_ACCESS_TTL_SECONDS * 1000 - 1000), true);
  assert.equal(hasPromoteAccess(token, password, now + PROMOTE_ACCESS_TTL_SECONDS * 1000), false);
});

test("password rotation invalidates existing access", () => {
  const token = createPromoteAccessToken(password, now);
  assert.equal(hasPromoteAccess(token, "a-different-test-passphrase-8472", now), false);
  assert.equal(hasPromoteAccess(token, undefined, now), false);
});

test("forged, malformed, extended, and future-dated tokens are rejected", () => {
  const token = createPromoteAccessToken(password, now);
  const parts = token.split(".");
  const changedSignature = `${parts.slice(0, 3).join(".")}.${parts[3][0] === "a" ? "b" : "a"}${parts[3].slice(1)}`;
  for (const candidate of [undefined, "true", password, token + ".extra", token.replace("v1", "v2"), changedSignature, "x".repeat(201)]) {
    assert.equal(hasPromoteAccess(candidate, password, now), false);
  }
  assert.equal(hasPromoteAccess(createPromoteAccessToken(password, now + 60_000), password, now), false);
  const changedExpiry = [parts[0], String(Number(parts[1]) + 1), parts[2], parts[3]].join(".");
  assert.equal(hasPromoteAccess(changedExpiry, password, now + 1000), false);
});

test("separate grants have independent random nonces", () => {
  const first = createPromoteAccessToken(password, now);
  const second = createPromoteAccessToken(password, now);
  assert.notEqual(first, second);
  assert.equal(hasPromoteAccess(first, password, now), true);
  assert.equal(hasPromoteAccess(second, password, now), true);
});
