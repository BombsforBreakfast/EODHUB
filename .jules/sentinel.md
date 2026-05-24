## 2024-05-23 - [Medium] Insecure Random Number Generation for Referral Codes
**Vulnerability:** The referral code generation logic (`makeCode` in `app/api/generate-referral-code/route.ts`) used `Math.random()` to pick characters. Since `Math.random()` is not cryptographically secure, generated referral codes could potentially be predicted by an attacker.
**Learning:** Even for non-secret identifiers like referral codes, using weak PRNGs can open up the system to enumeration or prediction attacks if the pool of generated values needs to be unpredictable.
**Prevention:** Use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating security-sensitive random strings, tokens, or unique identifiers.
