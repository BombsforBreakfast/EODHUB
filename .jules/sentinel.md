## 2024-05-14 - Replace Math.random with crypto.getRandomValues for secure referral codes
**Vulnerability:** Weak random number generation (`Math.random()`) used for generating referral codes.
**Learning:** `Math.random()` is not cryptographically secure and predictable, which could allow attackers to guess referral codes. Referral codes should be treated as sensitive tokens, especially if they provide benefits.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` for generating sensitive tokens, codes, or identifiers. Implement a helper function with rejection sampling if mapping to a specific character set to avoid modulo bias.
