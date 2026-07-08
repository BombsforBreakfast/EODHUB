## 2024-05-24 - [Medium] Fix Weak Random Number Generation in Referral Codes
**Vulnerability:** The function `makeReferralCode` used `Math.random()` to pick characters for a user's referral code.
**Learning:** `Math.random()` is not a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG), making generated tokens theoretically predictable and unsuitable for security-sensitive unique identifiers. The web crypto API (`crypto`) is globally available in modern Node.js and Edge runtimes.
**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` when generating tokens, passwords, referral codes, or session IDs.
