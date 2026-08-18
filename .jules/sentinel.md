## 2024-05-18 - [Weak RNG in Referral Code Generation]
**Vulnerability:** Weak random number generation using `Math.random()` in `makeReferralCode` inside `app/lib/server/ensureReferralCode.ts`.
**Learning:** `Math.random()` is not cryptographically secure and predictable, which could allow attackers to guess referral codes or bypass unique code constraints. Using `crypto.getRandomValues()` combined with avoiding modulo bias is necessary for secure random code generation.
**Prevention:** Always use `crypto.getRandomValues()` for generating sensitive codes or IDs that require a high degree of uniqueness and unpredictability.
