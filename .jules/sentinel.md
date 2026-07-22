## 2024-05-18 - [Weak Randomness]
**Vulnerability:** Weak random number generation using `Math.random()` in `ensureReferralCode.ts` to generate referral codes.
**Learning:** Math.random() is predictable and unsuitable for security or high-uniqueness purposes like generating sensitive identifiers or codes.
**Prevention:** Use `crypto.getRandomValues()` for generating random identifiers across the codebase.
