## 2024-05-24 - Cryptographically Weak Randomness for Referral Codes
**Vulnerability:** The referral code generation function `makeReferralCode` in `app/lib/server/ensureReferralCode.ts` uses `Math.random()`, which is a cryptographically weak pseudo-random number generator (PRNG).
**Learning:** `Math.random()` is not suitable for generating secure tokens or codes because its sequence can be predicted, potentially allowing an attacker to guess future referral codes and abuse the referral system.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating security-sensitive random values, such as referral codes, session IDs, or API keys, to ensure cryptographic strength.
