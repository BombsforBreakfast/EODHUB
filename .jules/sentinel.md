## 2026-08-19 - Secure Referral Code Generation
**Vulnerability:** Use of weak random number generator (Math.random()) for generating sensitive referral codes.
**Learning:** Math.random() is predictable and unsuitable for security-sensitive contexts like tokens or referral codes, allowing potential guessing or brute-forcing.
**Prevention:** Always use Web Crypto API (crypto.getRandomValues() or crypto.randomUUID()) for generating security-sensitive random values.
