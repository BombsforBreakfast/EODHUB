## 2024-11-21 - [Predictable Referral Codes]
**Vulnerability:** Insecure random number generation using `Math.random()` in `app/api/generate-referral-code/route.ts` could allow attackers to predict referral codes.
**Learning:** `Math.random()` is not cryptographically secure and should never be used for generating sensitive strings like referral codes, tokens, or unique identifiers.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` for secure random number generation in the application.