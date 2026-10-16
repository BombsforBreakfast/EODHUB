## 2025-05-24 - Empty Signature Authentication Bypass via timingSafeEqual
**Vulnerability:** Empty signatures or passwords could bypass authentication because `crypto.timingSafeEqual(Buffer.from(''), Buffer.from(''))` evaluates to true when the server secret is unconfigured (returning an empty expected signature).
**Learning:** Node.js `timingSafeEqual` returns true for two empty buffers. If the signing secret is missing or the expected signature can evaluate to an empty string, an attacker providing an empty signature can bypass the HMAC verification.
**Prevention:** Always explicitly check for the presence and truthiness of the expected signature string (e.g., `if (!expected) return false;`) before converting to buffers and comparing.
