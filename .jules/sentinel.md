## YYYY-MM-DD - JSON-LD XSS Injection
**Vulnerability:** XSS vulnerability through `dangerouslySetInnerHTML` injecting JSON.stringify output directly into `<script>` without sanitizing HTML tags (specifically `<` and `>`), which could allow XSS if any JSON field contains attacker-controlled data (e.g. `</script><script>alert(1)</script>`). Although in `app/layout.tsx` the payload currently appears statically defined, it's a critical pattern to address to prevent future issues if dynamic data is injected into JSON-LD.
**Learning:** `JSON.stringify()` does not escape HTML characters by default, and injecting it directly into `<script>` via `dangerouslySetInnerHTML` is unsafe.
**Prevention:** Always append `.replace(/</g, "\\u003c")` to `JSON.stringify()` when injecting into HTML.
