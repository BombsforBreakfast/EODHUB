## 2024-05-30 - Remove Hardcoded Password
**Vulnerability:** A hardcoded default password was used for an access gate when the environment variable was missing.
**Learning:** Hardcoded secrets in fallback paths expose the application to unauthorized access across all deployments without a configured secret.
**Prevention:** Always use cryptographically secure random values (`crypto.randomBytes`) for fallback secrets.