## 2024-05-15 - [Weak Random Number Generation for Referral Codes]
**Vulnerability:** The application uses `Math.random()` to generate referral codes in `app/lib/server/ensureReferralCode.ts`.
**Learning:** `Math.random()` is not cryptographically secure and produces predictable values. Generating security-sensitive tokens (like referral codes) with predictable RNG can allow attackers to guess valid codes, potentially leading to unauthorized benefits, bypassing intended limits, or exhausting the supply of valid codes (if uniqueness is enforced by retries).
**Prevention:** Always use cryptographically secure random number generators (e.g., `crypto.getRandomValues()` or `crypto.randomUUID()`) for generating any form of secure token, identifier, or secret.
## 2024-05-15 - [XSS via JSON-LD injection in Script Tags]
**Vulnerability:** The application uses `dangerouslySetInnerHTML` to render JSON-LD directly within a `<script>` tag in `app/layout.tsx` without sanitization. Specifically, `JSON.stringify()` is used directly.
**Learning:** If any string inside the serialized JSON object contains `</script>`, it could break out of the script tag and execute arbitrary HTML/JavaScript (XSS). While the current contents look static, this is a dangerous pattern that can easily become exploitable if dynamic data is later added to the schema.
**Prevention:** Always sanitize JSON serialized strings meant for `<script>` tags by replacing `<` with `\u003c`. E.g., `JSON.stringify(data).replace(/</g, '\\u003c')`.
