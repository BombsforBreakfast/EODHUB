## 2025-10-31 - [Security Enhancement] Replace Math.random() with crypto.getRandomValues()
**Vulnerability:** Weak random number generation using `Math.random()` to generate referral codes.
**Learning:** Math.random() isn't cryptographically secure and may allow a malicious actor to predict referral codes. We found this pattern in `app/lib/server/ensureReferralCode.ts`.
**Prevention:** Use `crypto.getRandomValues()` instead of `Math.random()` where predicting the random value has security implications.
