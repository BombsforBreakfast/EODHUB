## 2024-05-24 - [CRITICAL] Fix Empty-Signature Bypass in Authentication Gates
**Vulnerability:** Access gates (`loginMaintenanceGate` and `arcadeAccess`) were vulnerable to an empty-signature authentication bypass where `crypto.timingSafeEqual(Buffer.from(''), Buffer.from(''))` would evaluate to `true` when the underlying secret is empty or fallback values resulted in empty strings.
**Learning:** Fallback logic returning empty strings for HMAC signatures can cause `timingSafeEqual` to inadvertently authenticate empty signatures.
**Prevention:** Always use cryptographically secure random values (e.g., `crypto.randomBytes`) for fallback secrets generated once on module load, and explicitly verify that signature strings are truthy before comparing buffers.
