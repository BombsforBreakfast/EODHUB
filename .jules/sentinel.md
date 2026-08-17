## 2026-08-17 - Prevent XSS in layout.tsx
**Vulnerability:** XSS vulnerability via dangerouslySetInnerHTML in app/layout.tsx injecting JSON-LD without escaping `<` characters.
**Learning:** JSON.stringify does not escape HTML characters, making it unsafe to inject directly into script tags.
**Prevention:** Always replace `<` with `\u003c` when injecting serialized JSON into script tags using dangerouslySetInnerHTML.
## 2026-08-17 - Secure Referral Code Generation
**Vulnerability:** Weak random number generation using Math.random() to create referral codes.
**Learning:** Math.random() is predictable and should not be used for security-sensitive tokens like referral codes.
**Prevention:** Always use the Web Crypto API (crypto.getRandomValues()) for generating secure random values.
