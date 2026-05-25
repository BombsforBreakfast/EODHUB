## 2024-05-24 - [Insecure Random Number Generation for Referral Codes]
**Vulnerability:** Found `Math.random()` being used to generate referral codes in `app/api/generate-referral-code/route.ts`. `Math.random()` is not cryptographically secure and can be predictable.
**Learning:** Security-sensitive strings (like referral codes, tokens, passwords) were being generated using weak RNG (`Math.random()`), which poses a predictability risk.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating security-sensitive random data to ensure cryptographic security.
