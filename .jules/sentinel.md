## 2023-10-27 - Secure Code Generation
**Vulnerability:** Weak random number generation (`Math.random()`) used for generating access codes.
**Learning:** `Math.random()` is not cryptographically secure and predictable.
**Prevention:** Use `crypto.getRandomValues()` with rejection sampling for secure and unbiased string generation.
