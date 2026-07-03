
## 2024-10-27 - [Type Validation in JSON APIs]
**Vulnerability:** Missing explicit type checking for primitive types on parsed `req.json()` payloads.
**Learning:** `req.json()` can return any object or primitive. Without explicitly checking types (e.g., `typeof userId === 'string'`), an API might accept an object when a string is expected, leading to unexpected runtime TypeErrors or mass assignment / object injection bugs if the data is passed to database ORMs or queries.
**Prevention:** Always validate the specific type of expected primitives directly on the parsed JSON body before using them (e.g., `typeof value === 'string'`), rather than just checking for truthiness (`!value`).
