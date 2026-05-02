/**
 * Golden check: LASD training-facility explosion story should clear the gate
 * with a comfortably high score (manual review queue, not auto-publish).
 *
 * Run: npm run test:news
 */
import assert from "node:assert/strict";
import test from "node:test";

import { MIN_SCORE } from "./config/keywords";
import { analyzeCandidate, passesThreshold } from "./scoring";
import { LASD_GOLDEN_BODY_SAMPLE, LASD_GOLDEN_HEADLINE } from "./fixtures/lasdGoldenArticle";
import type { NewsCandidate } from "./types";

function goldenCandidate(): NewsCandidate {
  return {
    headline: LASD_GOLDEN_HEADLINE,
    source_name: "golden.test",
    source_url: "https://example.com/news/lasd-golden-fixture",
    canonical_url: "https://example.com/news/lasd-golden-fixture",
    summary: LASD_GOLDEN_BODY_SAMPLE,
    thumbnail_url: null,
    published_at: new Date().toISOString(),
    tags: [],
    is_satire: false,
    raw: { provider: "golden_fixture", query: '"deputies killed" explosion' },
    source_weight: 0,
    matched_discovery_queries: ['"deputies killed" explosion'],
  };
}

test("LASD golden article passes threshold with high score", () => {
  const c = goldenCandidate();
  const b = analyzeCandidate(c);

  assert.ok(b.titleHits > 0 || b.bodyHits > 0, "expected positive keyword hits");
  assert.ok(b.matchedTitleTerms.length > 0, "expected title term matches for debugging");
  assert.ok(
    b.matchedTitleTerms.some((x) => x.includes("lasd") || x.includes("explosion")),
    "expected LASD / explosion headline signals"
  );
  assert.ok(b.score >= MIN_SCORE, `expected score >= MIN_SCORE (${MIN_SCORE}), got ${b.score}`);
  assert.ok(b.score >= MIN_SCORE + 8, `expected comfortably high queue score, got ${b.score}`);
  assert.ok(passesThreshold(c, b.score), "expected passesThreshold true");
  assert.ok(b.leBoostAmount > 0 || b.compoundAmount > 0, "expected LE boost or compound bonus");
});
