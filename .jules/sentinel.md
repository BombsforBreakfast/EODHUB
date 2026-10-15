## 2025-03-09 - Fix XSS Vulnerability in JSON-LD Script Injection
**Vulnerability:** The JSON-LD script injected into `app/layout.tsx` using `dangerouslySetInnerHTML` directly renders `JSON.stringify({...})` without escaping HTML entities.
**Learning:** React's `dangerouslySetInnerHTML` is unaware of the context (script block vs HTML block). Direct `JSON.stringify` inside `<script>` allows attackers to terminate the script block with `</script>` and inject malicious code if any of the stringified data originates from user input, or just as a general defensive measure.
**Prevention:** Always use `.replace(/</g, "\\u003c")` on the output of `JSON.stringify` when placing it inside `<script dangerouslySetInnerHTML={{__html: ...}}>` to prevent XSS payloads from terminating the script tag.
