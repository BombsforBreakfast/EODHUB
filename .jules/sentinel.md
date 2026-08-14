## 2024-08-11 - Escape JSON-LD data in layout to prevent XSS
**Vulnerability:** Unescaped JSON object injected into a script tag using dangerouslySetInnerHTML (`app/layout.tsx`).
**Learning:** Even when injecting seemingly static structural data (like JSON-LD), using `.replace(/</g, "\\u003c")` on the stringified output is crucial defense-in-depth to prevent an attacker from breaking out of the script tag (e.g., using `</script>`) if user input is ever added to the object in the future.
**Prevention:** Always append `.replace(/</g, "\\u003c")` when injecting serialized JSON into the DOM via dangerouslySetInnerHTML.
