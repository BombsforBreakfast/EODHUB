## 2025-02-27 - [Security] Prevent Predictable Values in Tokens and Referral Codes
**Vulnerability:** Weak random number generation using `Math.random()` to create referral codes.
**Learning:** `Math.random()` does not provide cryptographically secure random numbers, making tokens or codes predictable and potentially guessable by an attacker. This pattern was found in `app/lib/server/ensureReferralCode.ts`.
**Prevention:** Use the Web Crypto API (`crypto.getRandomValues()` or `crypto.randomUUID()`) to safely generate unique identifiers, referral codes, or any other sensitive random tokens across the codebase.
