## 2024-05-18 - [Fix XSS vulnerability in dangerouslySetInnerHTML]
**Vulnerability:** XSS vulnerability in JSON-LD injection
**Learning:** When injecting serialized JSON into HTML using dangerouslySetInnerHTML, failing to escape the '<' character can lead to XSS if the JSON contains untrusted data.
**Prevention:** Always append `.replace(/</g, '\\u003c')` to `JSON.stringify()` output when injecting into script tags.
