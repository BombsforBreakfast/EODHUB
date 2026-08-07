
## 2024-05-27 - Replace weak PRNG with CSPRNG
**Vulnerability:** Weak PRNG `Math.random()` used for generating referral codes
**Learning:** `Math.random()` is not cryptographically secure and can lead to predictable generation of tokens/codes if an attacker observes the sequence.
**Prevention:** Use `crypto.getRandomValues()` (Web Crypto API) instead of `Math.random()` for any token, secret, or ID generation.
