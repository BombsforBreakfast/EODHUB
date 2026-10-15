## 2025-01-24 - Remediate Hardcoded Maintenance Password
**Vulnerability:** A hardcoded default password ("bombsforbreakfast") was used for the login maintenance gate.
**Learning:** Defaulting to a hardcoded string can lead to an authorization bypass if the gate is enabled but the environment variable is forgotten.
**Prevention:** Always use a securely generated random string (e.g., `randomBytes`) as a fallback for missing secrets so they cannot be guessed.
