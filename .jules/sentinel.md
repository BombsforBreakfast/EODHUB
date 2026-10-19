## 2024-03-24 - Cryptographically Secure Referral Codes
**Vulnerability:** Found `Math.random()` being used to generate referral codes in `app/lib/server/ensureReferralCode.ts`.
**Learning:** `Math.random()` is not cryptographically secure and can be predicted by attackers to guess valid referral codes and hijack rewards or cause collisions.
**Prevention:** Use `crypto.getRandomValues()` with rejection sampling for all security-sensitive random value generation (like tokens, passwords, or referral codes).
