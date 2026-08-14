## 2026-08-05 - Prevent XSS in JSON-LD Injection
**Vulnerability:** XSS vulnerability through `dangerouslySetInnerHTML` injecting unsanitized `JSON.stringify` output.
**Learning:** `JSON.stringify` does not escape `<` characters by default. When injected into a `<script>` block, this can allow an attacker to prematurely close the script tag and inject malicious HTML/script.
**Prevention:** Always append `.replace(/</g, "\\u003c")` to `JSON.stringify` outputs when used in `dangerouslySetInnerHTML`. Note that `\\u003c` is required so it evaluates to `\u003c` as a literal string in source code.
