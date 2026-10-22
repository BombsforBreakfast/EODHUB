## 2024-08-31 - [Critical] Empty HMAC Bypass
**Vulnerability:** `crypto.timingSafeEqual` returns `true` when comparing two empty buffers (e.g., `Buffer.from("")`). In Next.js server logic, an unconfigured fallback secret caused the signing function to return an empty string, allowing authentication bypass.
**Learning:** Always fail closed if a secret is missing. Returning an empty string as an HMAC signature allows attackers to craft trivial empty signatures that pass equality checks.
**Prevention:** Add explicit guard clauses (`if (!expected) return false;`) before comparing HMACs, and ideally generate cryptographically secure random bytes if a fallback secret is absolutely required.
