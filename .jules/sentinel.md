## 2026-09-20 - Fix Weak RNG in Referral Codes
**Vulnerability:** Referral codes were generated using the predictable `Math.random()`.
**Learning:** `Math.random()` should never be used for security purposes like tokens or codes, as it is predictable and lacks cryptographic security. Additionally, naive modulo arithmetic with secure random values introduces modulo bias.
**Prevention:** Use the Web Crypto API (`crypto.getRandomValues()`) for generating secure tokens, and apply rejection sampling when mapping random bytes to a character set to avoid modulo bias.
