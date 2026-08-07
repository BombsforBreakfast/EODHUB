## 2024-05-18 - Insecure Randomness for Security Functions
**Vulnerability:** Weak random number generation in `ensureReferralCode.ts` using `Math.random()`.
**Learning:** `Math.random()` was being used to generate referral codes. Since these are often tied to sensitive functionality like account benefits or money, they should not be predictable. The JS `Math.random()` PRNG is not cryptographically secure and can be guessed after observing enough outputs.
**Prevention:** Use `crypto.getRandomValues()` (in browsers or Node >= 15 with `crypto` global) or `crypto.randomUUID()` when generating security-sensitive random strings, tokens, IDs, or codes.
