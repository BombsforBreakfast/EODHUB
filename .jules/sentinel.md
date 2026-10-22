## 2024-10-24 - Remove Hardcoded Maintenance Password
**Vulnerability:** Found a hardcoded fallback password in the login maintenance gate.
**Learning:** Hardcoded default credentials provide an easy backdoor if environmental variables fail to load. Using a static fallback string compromises the security of the maintenance bypass logic.
**Prevention:** Always use cryptographically secure random values (e.g., `crypto.randomBytes`) for fallback secrets or fail securely.
