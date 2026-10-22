## 2024-05-31 - [Critical] Remove hardcoded password in login maintenance gate
**Vulnerability:** A hardcoded password ("bombsforbreakfast") is used as a fallback for the login maintenance gate.
**Learning:** Hardcoded secrets in source code can be easily extracted by attackers, leading to unauthorized access.
**Prevention:** Never use hardcoded fallback passwords for authentication or authorization logic. If a required secret is missing from the environment, the application should fail securely (e.g., return false or throw an error) instead of falling back to a known value.
