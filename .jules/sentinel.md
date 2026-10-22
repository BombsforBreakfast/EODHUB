## 2025-02-27 - [XSS mitigation via JSON.stringify()]
**Vulnerability:** XSS risk in JSON serialization embedded inside `<script>` tags
**Learning:** `JSON.stringify()` alone inside a `<script>` block doesn't sanitize closing tags or other sensitive HTML, opening potential XSS issues.
**Prevention:** Follow memory guidelines: `.replace(/</g, "\\u003c")` for JSON structures nested in `dangerouslySetInnerHTML`.

## 2025-02-27 - [Secure random value generation]
**Vulnerability:** Weak RNG (`Math.random()`) used for sensitive components or database keys.
**Learning:** `Math.random()` generates predictable values that are insufficiently random for identifiers and security codes.
**Prevention:** Migrate to using `crypto.getRandomValues()` or `crypto.randomUUID()` depending on the context.
