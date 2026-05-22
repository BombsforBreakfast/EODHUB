## 2024-05-24 - [Insecure Randomness in Referral Code Generation]
**Vulnerability:** Weak random number generation using `Math.random()` in `app/api/generate-referral-code/route.ts` to create user referral codes.
**Learning:** `Math.random()` is not cryptographically secure, which means generated codes could potentially be predicted or brute-forced, leading to unauthorized use or guessing of referral codes.
**Prevention:** Use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating random tokens, codes, or file names to ensure cryptographic security.
