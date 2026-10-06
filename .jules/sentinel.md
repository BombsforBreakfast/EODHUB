## 2025-02-24 - Secure Referral Code Generation
**Vulnerability:** Weak PRNG was used to generate user referral codes, making them potentially predictable.
**Learning:** Weak PRNGs should never be used for security-sensitive or unique identifier generation, as their state can be predicted, leading to possible generation collision or enumeration vulnerabilities. Modulo bias must also be accounted for when using secure RNG.
**Prevention:** Always use cryptographically secure RNG with proper unbiased methods (like rejection sampling) when generating tokens, passwords, or referral codes.
