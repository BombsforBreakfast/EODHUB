## 2025-02-27 - [XSS] JSON-LD script injection vector via dangerouslySetInnerHTML
**Vulnerability:** XSS vulnerability risk when passing `JSON.stringify` directly into `dangerouslySetInnerHTML` for `<script type="application/ld+json">` tags.
**Learning:** `JSON.stringify` doesn't escape `<` characters. If untrusted data is ever incorporated into the JSON structure, it could prematurely close the `<script>` tag (`</script>`) and inject an attacker's script payload, resulting in Cross-Site Scripting (XSS).
**Prevention:** Always append `.replace(/</g, "\\u003c")` to the output of `JSON.stringify` when injecting JSON into `<script>` tags using `dangerouslySetInnerHTML`.
