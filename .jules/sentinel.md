# Sentinel Journal

## 2024-11-20 - [Insecure Randomness in Referral Code Generation]
**Vulnerability:** Weak random number generation using `Math.random()` to generate referral codes.
**Learning:** Even if `Math.random()` seems "good enough" for short strings, it is not cryptographically secure and can be predicted, making it unsuitable for security-sensitive tokens like referral codes.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` for generating any unique tokens, codes, or filenames to ensure cryptographic randomness.
