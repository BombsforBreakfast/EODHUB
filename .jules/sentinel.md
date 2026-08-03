## 2024-10-24 - XSS via dangerouslySetInnerHTML in JSON-LD
**Vulnerability:** JSON-LD injected directly into a script tag without escaping `<` characters, leading to XSS if any data was dynamic.
**Learning:** JSON.stringify is not safe for injection in HTML script tags because an attacker could inject `</script><script>alert(1)</script>`.
**Prevention:** Always append `.replace(/</g, "\\u003c")` to `JSON.stringify()` when interpolating into `<script>` elements.
