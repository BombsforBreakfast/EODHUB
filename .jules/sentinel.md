## 2026-07-12 - Replaced Math.random with CSPRNG
**Vulnerability:** Weak random number generation using Math.random() for referral codes.
**Learning:** Even non-critical identifiers like referral codes can benefit from secure random generation to prevent predictability and brute-forcing. Modulo bias is a known issue but acceptable here due to low risk.
**Prevention:** Use crypto.getRandomValues() or crypto.randomUUID() instead of Math.random() for any sensitive or unique identifier generation.
