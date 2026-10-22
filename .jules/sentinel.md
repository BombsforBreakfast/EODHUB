## 2024-05-24 - Secure Referral Code Generation
**Vulnerability:** Weak random number generation in `makeReferralCode` using `Math.random()`.
**Learning:** `Math.random()` is not cryptographically secure and could allow attackers to predict referral codes. Using `crypto.getRandomValues()` with rejection sampling ensures strong unpredictability without modulo bias.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` for generating security-sensitive tokens, referral codes, or any unpredictable values.
