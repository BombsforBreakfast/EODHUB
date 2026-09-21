## 2024-05-24 - [Medium] Fix Weak RNG for Referral Code Generation
**Vulnerability:** Weak random number generation using `Math.random()` in `app/lib/server/ensureReferralCode.ts`.
**Learning:** `Math.random()` is not cryptographically secure and should not be used to generate referral codes or tokens as they might be guessable or subject to collisions in high-concurrency scenarios where prediction of state is possible.
**Prevention:** Use the Web Crypto API (`crypto.getRandomValues()`) or Node.js `crypto` module for generating secure random strings, handling modulo bias correctly if converting random bytes to a specific character set.
