## 2024-10-24 - Hardcoded Fallback Secret
**Vulnerability:** A server-side security gate used a hardcoded fallback secret, allowing anyone with knowledge of the codebase to bypass the gate if no environment variable was set.
**Learning:** Hardcoded fallback values for security controls defeat the purpose of the control.
**Prevention:** Use a securely generated random fallback (e.g., `crypto.randomBytes`) initialized at module load so that unconfigured instances fail securely without exposing a known bypass.
