## 2025-02-28 - [MEDIUM] Secure Referral Code Generation
**Vulnerability:** Weak random number generation (`Math.random()`) was being used to generate referral codes.
**Learning:** This predictability could potentially allow an attacker to guess future referral codes and abuse the referral system.
**Prevention:** Use cryptographically secure random number generators (CSPRNG), specifically `crypto.getRandomValues()` globally available in modern environments, instead of `Math.random()` when creating unique identifiers, tokens, or codes with security implications.
