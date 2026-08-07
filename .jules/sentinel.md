## 2025-03-05 - Weak Randomness in Referral Code Generation
**Vulnerability:** In `ensureReferralCode.ts`, referral codes are generated using `Math.random()`.
**Learning:** This is cryptographically insecure and could allow attackers to guess referral codes if the pool of generated codes isn't large enough or if they can predict the random sequence. In security-sensitive code, such as generating unique tokens or referral codes, a cryptographically secure pseudo-random number generator (CSPRNG) must be used.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating tokens, referral codes, or session IDs.
