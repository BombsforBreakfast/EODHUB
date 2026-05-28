## 2024-05-24 - [Replace Insecure Randomness in Token Generation]
**Vulnerability:** Used `Math.random()` to generate referral codes in `app/api/generate-referral-code/route.ts`. `Math.random()` is not cryptographically secure, meaning generated tokens could be predictable.
**Learning:** `Math.random()` was used for a token/security-critical purpose, compromising the unpredictability of the tokens.
**Prevention:** Use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating tokens, referral codes, or session IDs to ensure cryptographically secure pseudo-random number generation.
