## 2024-05-24 - [Medium] Insecure Random Number Generation for Referral Codes
**Vulnerability:** The referral code generation logic used `Math.random()` to pick characters. `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG).
**Learning:** In a context where unguessability is important (like referral codes), predictable PRNGs can be exploited by attackers to guess other valid codes or predict future ones. This could lead to abuse of the referral system.
**Prevention:** Use `crypto.getRandomValues()` (or `crypto.randomUUID()`) instead of `Math.random()` when generating referral codes, tokens, or other strings that require cryptographic security.
