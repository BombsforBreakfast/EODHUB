## 2024-05-24 - Empty Signature Authentication Bypass
**Vulnerability:** Application allows authentication bypass when a secret is unset and an empty signature is provided.
**Learning:** `crypto.timingSafeEqual` returns `true` when comparing two empty buffers. If a signature generation function returns an empty string when the secret is missing, and the user provides an empty signature, both buffers will be empty and `timingSafeEqual` will validate the signature as correct.
**Prevention:** Always explicitly check for the presence and truthiness of the expected signature string (e.g., `if (!expected) return false;`) before converting it to a Buffer and using `crypto.timingSafeEqual`.
