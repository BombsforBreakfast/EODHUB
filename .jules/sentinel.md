## 2025-05-18 - [TimingSafeEqual Empty Buffer Bypass]
**Vulnerability:** Authentication bypass via empty signatures.
**Learning:** `crypto.timingSafeEqual` in Node.js returns `true` when comparing two empty buffers, allowing signature bypass if the expected signature can be empty.
**Prevention:** Always verify the expected signature is non-empty before comparing.