## 2024-10-24 - [HIGH] Fix Weak Randomness for Referral Codes
**Vulnerability:** Referral codes used for potentially sensitive operations or accounting were generated using `Math.random()`, which is a weak pseudo-random number generator.
**Learning:** `Math.random()` outputs are predictable if internal states are known. It should not be used for security tokens, credentials, or referal codes that should not be guessable.
**Prevention:** Always use a cryptographically secure pseudo-random number generator (CSPRNG) like `crypto.getRandomValues()` or `crypto.randomBytes()` for tokens and identifiers that require unpredictability.
