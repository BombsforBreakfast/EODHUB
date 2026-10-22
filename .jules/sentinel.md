
## 2024-05-24 - Hardcoded Fallback Secret in Login Maintenance Gate
**Vulnerability:** A hardcoded string was used as a fallback secret in the login maintenance gate.
**Learning:** Using predictable or hardcoded fallback secrets creates a bypass vector if the primary secret is missing or misconfigured in the environment.
**Prevention:** Use a cryptographically secure, dynamically generated value (e.g., `crypto.randomBytes`) for fallback secrets, and evaluate it at module-load time for consistency.
