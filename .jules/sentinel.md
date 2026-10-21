## 2024-05-24 - Cryptographically Secure Referral Codes
**Vulnerability:** Weak random number generation using Math.random() for generating referral codes.
**Learning:** Math.random() is predictable and unsuitable for generating unique codes, tokens, or security-sensitive values.
**Prevention:** Always use crypto.getRandomValues() or crypto.randomUUID() for secure random string generation, and ensure modulo bias is prevented when selecting characters from a custom alphabet using rejection sampling.
