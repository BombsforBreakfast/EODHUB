## 2025-02-18 - Fix Weak RNG in Referral Code Generation
**Vulnerability:** Weak random number generator (`Math.random()`) used for generating secure values (referral codes).
**Learning:** `Math.random()` generates predictable values. Using it to construct security-sensitive codes like referral/invite codes could allow attackers to predict other valid codes, potentially leading to unauthorized access, reward abuse, or enumeration attacks.
**Prevention:** Always use cryptographically secure random number generators (`crypto.getRandomValues()` or `crypto.randomUUID()`) for generating any form of secret, token, ID, or code.

## 2025-02-18 - Fix Weak RNG in Referral Code Generation
**Vulnerability:** Weak random number generator (`Math.random()`) used for generating secure values (referral codes).
**Learning:** `Math.random()` generates predictable values. Using it to construct security-sensitive codes like referral/invite codes could allow attackers to predict other valid codes, potentially leading to unauthorized access, reward abuse, or enumeration attacks.
**Prevention:** Always use cryptographically secure random number generators (`crypto.getRandomValues()` or `crypto.randomUUID()`) for generating any form of secret, token, ID, or code, while mitigating modulo bias.
