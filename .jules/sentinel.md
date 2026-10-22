## 2025-03-09 - Insecure Random Number Generation in Referral Code Creation

**Vulnerability:** The referral code generation logic (`makeReferralCode` in `app/lib/server/ensureReferralCode.ts`) uses `Math.random()` to select characters from an alphabet.

**Learning:** `Math.random()` is not cryptographically secure, and its output is predictable. In a secure context, particularly where a value might be used as an access token, discount code, or any form of credential or unique identifier that could be brute-forced or guessed if the PRNG state is known, a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) must be used. While the PRNG state attack is less straightforward here, relying on `Math.random()` for anything requiring uniqueness and un-guessability is a poor security practice. The project uses the Node.js `crypto` module, or the global `crypto` object in Edge/Browser environments. Given this file seems to be a server file (`app/lib/server/ensureReferralCode.ts`), we can use `crypto.getRandomValues()` to generate secure random values and use rejection sampling to avoid modulo bias when mapping to our alphabet.

**Prevention:** Always use `crypto.getRandomValues()` or `crypto.randomUUID()` for generating secure random values, tokens, or unique identifiers. Be mindful of modulo bias when converting raw bytes to a specific character set.
