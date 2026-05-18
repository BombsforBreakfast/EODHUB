## 2024-03-24 - [XSS vulnerability in application/ld+json]
**Vulnerability:** XSS vulnerability when using dangerouslySetInnerHTML to embed JSON in a <script> tag.
**Learning:** JSON.stringify can output '<', which can be used to inject HTML/scripts into the page, breaking out of the <script> block.
**Prevention:** Always escape '<' as '<' when embedding JSON inside a <script> block.
