## 2025-05-15 - [Remove Hardcoded Secret]
**Vulnerability:** Critical hardcoded fallback password in login maintenance gate.
**Learning:** Fallback values for secrets should not use predictable strings.
**Prevention:** Use a securely generated random string as a fallback when an environment variable is missing.
