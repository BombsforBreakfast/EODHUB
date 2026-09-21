## 2024-05-15 - [Medium] Fix Weak RNG in Referral Code Generation
**Vulnerability:** Weak random number generation using `Math.random()` to generate referral codes in `app/lib/server/ensureReferralCode.ts`.
**Learning:** `Math.random()` is predictable and not cryptographically secure, which could theoretically allow an attacker to predict referral codes.
**Prevention:** Use `crypto.getRandomValues()` to generate cryptographically secure random numbers instead.
