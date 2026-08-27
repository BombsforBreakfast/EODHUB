## 2024-05-18 - [Hardcoded Empty/Placeholder Password Mitigation]
**Vulnerability:** A hardcoded string ("google-oauth-placeholder") was used as a dummy password when creating business accounts via Google OAuth in `app/business-org/onboarding/page.tsx`.
**Learning:** Using predictable, hardcoded strings as placeholder passwords introduces a severe risk of empty/predictable-password bypass vulnerabilities.
**Prevention:** Use cryptographically secure random string generation (e.g., `crypto.randomUUID()`) to generate placeholder passwords that cannot be guessed or bypassed.
