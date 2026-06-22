## $(date +%Y-%m-%d) - Fix XSS Vulnerability in JSON-LD Injection
**Vulnerability:** Insecure JSON-LD serialization into `<script>` tags using `dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }}`.
**Learning:** `JSON.stringify()` output can contain malicious HTML tags like `</script>` which the browser interprets before the script engine runs.
**Prevention:** Always append `.replace(/</g, "\\u003c")` to `JSON.stringify()` outputs when injecting into inline HTML to prevent XSS.
