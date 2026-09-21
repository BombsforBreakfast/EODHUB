## 2024-05-25 - Hardcoded Maintenance Password
**Vulnerability:** A hardcoded secret ("bombsforbreakfast") was used as a fallback for the login maintenance gate.
**Learning:** Hardcoded secrets present a critical risk if code is accessed. Fallback secrets must be securely generated at runtime. Additionally, empty string fallbacks must be prevented because `timingSafeEqual(Buffer.from(''), Buffer.from(''))` evaluates to `true`, potentially allowing an empty-signature authentication bypass.
**Prevention:** Always use cryptographically secure random values (e.g., `crypto.randomBytes`) for fallback secrets and fail securely when missing or empty.
