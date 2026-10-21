## 2024-05-15 - [Insecure Random Number Generation]
**Vulnerability:** Weak random number generation (`Math.random()`) used for creating referral codes in `app/lib/server/ensureReferralCode.ts`.
**Learning:** `Math.random()` is not cryptographically secure and can be predictable, potentially allowing attackers to guess referral codes or bypass related logic if codes are used for security or uniqueness guarantees.
**Prevention:** Always use the Web Crypto API (`crypto.getRandomValues()` or `crypto.randomUUID()`) when generating random tokens, referral codes, or any unique identifiers in security-sensitive or business-critical contexts.
