## 2024-08-20 - Upgrade RNG to Web Crypto API for Tokens
**Vulnerability:** Weak random number generation (`Math.random()`) was being used for sensitive token generation (`makeReferralCode`).
**Learning:** `Math.random()` is predictable and not suitable for secure tokens or IDs.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating security-sensitive values like referral codes, tokens, or session IDs. Ensure modulo bias is prevented via rejection sampling when selecting random characters.
