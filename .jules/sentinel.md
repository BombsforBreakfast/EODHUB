## 2024-06-05 - Predictable Randomness in Referral Codes
**Vulnerability:** The application used `Math.random()` to generate referral codes. `Math.random()` is not cryptographically secure and can generate predictable output, potentially allowing attackers to guess valid referral codes.
**Learning:** The built-in `Math.random()` function is designed for general use, not for security-critical contexts like tokens or IDs.
**Prevention:** Always use the Web Crypto API (`crypto.getRandomValues()` or `crypto.randomUUID()`) for generating secure random values, tokens, IDs, or filenames.