## 2024-05-25 - [XSS Fix]
**Vulnerability:** XSS vulnerability
**Learning:** Found an issue with dangerouslySetInnerHTML
**Prevention:** Always use proper JSON sanitization when injecting data into scripts.

## 2024-05-25 - [HMAC Auth Bypass Fix]
**Vulnerability:** Empty HMAC signature bypass via `crypto.timingSafeEqual`
**Learning:** `timingSafeEqual(Buffer.from(""), Buffer.from(""))` evaluates to `true`. If an expected HMAC signature can be empty (e.g. missing environment variables), an attacker can supply an empty signature to bypass the check.
**Prevention:** Always verify that the expected signature string is present and non-empty (`if (!expected) return false;`) before creating buffers and comparing them.
