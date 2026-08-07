## 2024-05-24 - [Replace weak random with crypto for secure generation]
**Vulnerability:** Weak random number generation (`Math.random()`) used for generating referral codes.
**Learning:** `Math.random()` generates predictable values which can be deduced and exploited in security-sensitive scenarios like token or code generation. The memory context mentions 'Use crypto.getRandomValues() or crypto.randomUUID() instead of Math.random() for secure random number generation throughout the codebase, particularly for generating referral codes'.
**Prevention:** Use cryptographically secure pseudorandom number generators like `crypto.getRandomValues()` to generate secure, unpredictable values.
