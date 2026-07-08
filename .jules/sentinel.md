## 2026-07-04 - [Weak RNG Fix]
**Vulnerability:** Weak random number generation in makeReferralCode
**Learning:** Found an instance in app/lib/server/ensureReferralCode.ts where Math.random() was used to generate referral codes, which can be predictable.
**Prevention:** Always use crypto.getRandomValues() or crypto.randomUUID() for secure random number generation.
