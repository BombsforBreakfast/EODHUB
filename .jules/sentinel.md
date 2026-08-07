## 2025-01-01 - [XSS Prevention in JSON-LD]
**Vulnerability:** XSS vulnerability in `app/layout.tsx` when injecting JSON-LD inside a script tag without replacing `<` characters.
**Learning:** `JSON.stringify` alone is not safe for injection into HTML script tags because a string containing `</script>` could prematurely terminate the script and execute arbitrary code.
**Prevention:** Always append `.replace(/</g, "\\u003c")` to the `JSON.stringify()` output when injecting serialized JSON into `<script>` tags using `dangerouslySetInnerHTML`.