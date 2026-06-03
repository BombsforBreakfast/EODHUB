## 2024-05-18 - [Fix JSON-LD XSS Vulnerability]
**Vulnerability:** JSON-LD injected directly via `dangerouslySetInnerHTML` in `app/layout.tsx` without escaping the `<` character.
**Learning:** `JSON.stringify` does not escape HTML characters by default. If the JSON object contains string values with a `</script>` tag, it can terminate the `<script>` tag prematurely and allow injection of arbitrary script tags. While the current `app/layout.tsx` uses static data, this is a pattern that must be secure to prevent copy-paste vulnerabilities or future dynamic data injection.
**Prevention:** When injecting JSON into `<script>` tags, always use `.replace(/</g, "\\u003c")` on the output of `JSON.stringify()`.
