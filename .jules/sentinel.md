## 2024-05-24 - Cryptographically Secure Random Number Generation for Referral Codes
**Vulnerability:** Weak random number generation using `Math.random()` to generate user referral codes (`makeReferralCode` in `app/lib/server/ensureReferralCode.ts`).
**Learning:** `Math.random()` is not cryptographically secure and predictable, which could allow malicious actors to guess or reverse-engineer referral codes. When transitioning to `crypto.getRandomValues()`, care must be taken to allocate single typed arrays outside of loops and handle modulo bias by dropping values greater than `256 - (256 % CHARS.length)`.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` for tokens, identifiers, or referral codes instead of `Math.random()`.
