
## 2024-05-18 - Remove Hardcoded Fallback Password
**Vulnerability:** A hardcoded fallback password was used in `app/lib/server/loginMaintenanceGate.ts` for the login maintenance gate.
**Learning:** Hardcoding fallback secrets or passwords creates a significant security risk, as the default secret is committed to source control and can be easily bypassed if the environment variable is not configured.
**Prevention:** When an environment variable for a secret/password is missing, either fail securely by throwing an error or generate a cryptographically secure random string at runtime (e.g., using `crypto.randomBytes`).
