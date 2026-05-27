
## 2026-05-27 - [MEDIUM] Insecure Random Number Generation for Referral Codes
**Vulnerability:** The referral code generation (`makeCode` function) used `Math.random()` to generate codes for users.
**Learning:** `Math.random()` is not cryptographically secure and its values can be predicted, allowing an attacker to potentially guess referral codes if they collect enough data points.
**Prevention:** Use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating security-sensitive tokens, referral codes, or any identifier that should be unguessable.
