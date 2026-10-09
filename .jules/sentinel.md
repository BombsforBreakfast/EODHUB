## 2024-05-30 - Replace Weak RNG in Referral Code Generation
**Vulnerability:** The referral code generation function (`makeReferralCode`) was using `Math.random()`, which is a weak, non-cryptographic pseudo-random number generator (PRNG). This predictability could allow an attacker to guess referral codes.
**Learning:** `Math.random()` should never be used for security-sensitive purposes such as generating tokens, secrets, or identifiers that must remain unguessable.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` for secure random number generation. When mapping random bytes to a character set, employ rejection sampling to avoid modulo bias.
