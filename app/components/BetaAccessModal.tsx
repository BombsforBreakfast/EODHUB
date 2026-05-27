// TEMPORARY BETA GATE
// Remove after public launch (30–45 days)

"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Eye, EyeOff } from "lucide-react";
import EodCrabLogo from "@/app/components/EodCrabLogo";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import {
  codeFromValidateEmailResponse,
  mapEmailValidationCode,
  userMessageForSignupCode,
  type ValidateEmailApiBody,
} from "@/app/lib/auth/signupErrors";

const STORAGE_KEY = "beta_access_granted";

export type BetaGatePhase = "checking" | "blocked" | "granted";

type BetaAccessModalProps = {
  onPhaseChange?: (phase: BetaGatePhase) => void;
};

const WAITLIST_THANK_YOU =
  "Thanks — you're on the waitlist. You'll receive an email when the doors open.";

const BETA_PRICING_FOOTNOTE =
  "EOD Hub is free during beta and for the first 30 days after we go live. After that, a $1.99/month subscription helps us operate, maintain, and improve the site.";

const WAITLIST_SERVICE_OPTIONS = [
  "Army",
  "Navy",
  "Marines",
  "Air Force",
  "Civil Service",
  "Federal",
  "Civilian Bomb Tech",
] as const;

export default function BetaAccessModal({ onPhaseChange }: BetaAccessModalProps) {
  const [phase, setPhase] = useState<BetaGatePhase>("checking");
  const [accessCode, setAccessCode] = useState("");
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSubmitting, setCodeSubmitting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  /** After a successful waitlist insert: thank-you only (does NOT unlock the gate). */
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);

  const setPhaseAndNotify = useCallback(
    (next: BetaGatePhase) => {
      setPhase(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange],
  );

  useEffect(() => {
    let cancelled = false;

    async function resolveGrant() {
      setPhaseAndNotify("checking");
      try {
        const res = await fetch("/api/validate-beta", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        const data = (await res.json()) as { granted?: boolean };
        if (data.granted === true) {
          try {
            window.localStorage.setItem(STORAGE_KEY, "true");
          } catch {
            /* ignore */
          }
          setPhaseAndNotify("granted");
          return;
        }
        try {
          if (window.localStorage.getItem(STORAGE_KEY) === "true") {
            window.localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          /* ignore */
        }
        setPhaseAndNotify("blocked");
      } catch {
        if (!cancelled) setPhaseAndNotify("blocked");
      }
    }

    void resolveGrant();
    return () => {
      cancelled = true;
    };
  }, [setPhaseAndNotify]);

  /** Only after successful POST /api/validate-beta (httpOnly cookie + local mirror). */
  const unlockWithBetaCode = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore quota / private mode */
    }
    setPhaseAndNotify("granted");
  }, [setPhaseAndNotify]);

  const handleCodeSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setCodeError(null);
      const enteredCode = accessCode.trim();
      if (!enteredCode) {
        setCodeError("Please enter an access code.");
        return;
      }
      setCodeSubmitting(true);
      try {
        const res = await fetch("/api/validate-beta", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: enteredCode }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string };
        if (res.ok && data.success) {
          unlockWithBetaCode();
        } else if (res.status === 503) {
          setCodeError(
            "Beta access isn't configured on this server. If you're developing locally, restart npm run dev after setting BETA_ACCESS_CODE in .env.local.",
          );
        } else if (res.status === 401) {
          setCodeError(data.message ?? "Access code is incorrect.");
        } else if (res.status === 429) {
          setCodeError(
            data.message ?? "Too many attempts. Please wait a few minutes and try again.",
          );
        } else if (res.status === 400) {
          setCodeError(data.message ?? "Please enter an access code.");
        } else {
          setCodeError(data.message ?? "Access code is incorrect.");
        }
      } catch {
        setCodeError("Something went wrong. Please try again in a moment.");
      } finally {
        setCodeSubmitting(false);
      }
    },
    [accessCode, unlockWithBetaCode],
  );

  const handleWaitlistSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setWaitlistError(null);
      if (!firstName.trim() || !lastName.trim()) {
        setWaitlistError("First name and last name are required.");
        return;
      }
      if (!service.trim()) {
        setWaitlistError("Service branch is required.");
        return;
      }
      const clientCheck = validateEmailForRegistration(email);
      if (!clientCheck.ok) {
        setWaitlistError(userMessageForSignupCode(mapEmailValidationCode(clientCheck.code)));
        return;
      }
      setWaitlistSubmitting(true);
      try {
        const res = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: clientCheck.email,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            service: service.trim(),
          }),
        });
        const data = (await res.json()) as ValidateEmailApiBody;
        if (!res.ok || !data.ok) {
          const code = codeFromValidateEmailResponse(res, data);
          setWaitlistError(userMessageForSignupCode(code));
          return;
        }
        setFirstName("");
        setLastName("");
        setEmail("");
        setService("");
        setWaitlistSubmitted(true);
      } catch {
        setWaitlistError(userMessageForSignupCode("generic"));
      } finally {
        setWaitlistSubmitting(false);
      }
    },
    [email, firstName, lastName, service],
  );

  if (phase === "granted") {
    return null;
  }

  const isChecking = phase === "checking";

  const inputBase: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(160, 175, 150, 0.35)",
    background: "rgba(8, 10, 12, 0.85)",
    color: "#e8eae6",
    fontSize: 15,
    outline: "none",
  };

  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(200, 210, 195, 0.85)",
    marginBottom: 6,
  };

  const primaryBtn: CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(180deg, #c4d4a8 0%, #9aaf78 100%)",
    color: "#0d0f0c",
    fontWeight: 800,
    fontSize: 15,
    cursor: waitlistSubmitting ? "not-allowed" : "pointer",
    opacity: waitlistSubmitting ? 0.65 : 1,
  };

  const secondaryBtn: CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(160, 175, 150, 0.45)",
    background: "rgba(10, 12, 14, 0.75)",
    color: "#e8eae6",
    fontWeight: 800,
    fontSize: 15,
    cursor: codeSubmitting ? "not-allowed" : "pointer",
    opacity: codeSubmitting ? 0.65 : 1,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  };

  const selectBase: CSSProperties = {
    ...inputBase,
    cursor: waitlistSubmitting ? "not-allowed" : "pointer",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a8b49a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: 36,
  };

  const modalTree = (
    <>
      <style>{`
        @keyframes betaGateFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes betaGatePopIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .beta-gate-overlay {
          min-height: 100vh;
          min-height: 100dvh;
          min-height: -webkit-fill-available;
        }
        .beta-access-code-eye {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border: none;
          background: transparent;
          color: rgba(200, 210, 195, 0.72);
          cursor: pointer;
          border-radius: 6px;
          transition: color 0.15s ease, opacity 0.15s ease;
          opacity: 0.72;
        }
        .beta-access-code-eye:hover:not(:disabled) {
          opacity: 1;
          color: rgba(228, 236, 218, 0.98);
        }
        .beta-access-code-eye:disabled {
          cursor: not-allowed;
          opacity: 0.35;
        }
        @media (max-width: 480px) {
          .beta-gate-sticker {
            font-size: 22px !important;
            padding: 8px 16px !important;
          }
          .beta-gate-title {
            font-size: 24px !important;
            letter-spacing: 1px !important;
          }
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="beta-gate-heading"
        className="beta-gate-overlay"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          zIndex: 20000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "max(20px, env(safe-area-inset-top, 0px))",
          paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
          paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
          boxSizing: "border-box",
          background: "radial-gradient(ellipse at 50% 20%, rgba(55, 62, 48, 0.5) 0%, rgba(6, 8, 10, 0.97) 55%, #040506 100%)",
          animation: "betaGateFadeIn 320ms ease-out both",
          touchAction: "manipulation",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            maxHeight: "min(calc(100dvh - max(40px, env(safe-area-inset-top) + env(safe-area-inset-bottom))), 900px)",
            overflowX: "hidden",
            overflowY: "auto",
            borderRadius: 16,
            border: "1px solid rgba(140, 155, 125, 0.35)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",
            background: "linear-gradient(165deg, rgba(22, 26, 22, 0.98) 0%, rgba(10, 12, 14, 0.99) 100%)",
            padding: "28px 24px 26px",
            animation: isChecking ? undefined : "betaGatePopIn 380ms ease-out 40ms both",
          }}
        >
          {isChecking ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: "rgba(220, 225, 215, 0.92)",
                fontSize: 15,
                fontWeight: 600,
              }}
              aria-live="polite"
            >
              One moment…
            </div>
          ) : (
          <>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ marginTop: 0, display: "flex", justifyContent: "center" }}>
              <div style={{ transform: "scale(0.72)", transformOrigin: "center top" }}>
                <EodCrabLogo variant="login" priority />
              </div>
            </div>
            <div
              className="beta-gate-title"
              style={{
                marginTop: 2,
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: 2,
                color: "#e8eae6",
                lineHeight: 1.1,
              }}
            >
              EOD-HUB
            </div>
            <div
              id="beta-gate-heading"
              className="beta-gate-sticker"
              style={{
                display: "inline-block",
                marginTop: 10,
                padding: "10px 22px",
                background: "#d4c45c",
                color: "#1a1c14",
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: 0.5,
                borderRadius: 4,
                transform: "rotate(-2deg)",
                boxShadow: "4px 4px 0 rgba(0,0,0,0.35), 0 0 0 2px #1a1c14",
                textTransform: "none",
              }}
            >
              Is in Beta!!!
            </div>
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: "rgba(220, 225, 215, 0.92)",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            <p style={{ margin: "0 0 10px" }}>
              EOD-HUB is currently in Beta.
              <br />
              Access is limited.
            </p>
          </div>

          <form onSubmit={handleCodeSubmit} style={{ marginBottom: 8 }}>
            <label htmlFor="beta-access-code" style={labelStyle}>
              Beta Access Code
            </label>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 11,
                lineHeight: 1.45,
                color: "rgba(200, 210, 195, 0.65)",
              }}
            >
              This block is not for user referral codes.
            </p>
            <div style={{ position: "relative", width: "100%", maxWidth: "100%", marginBottom: 6 }}>
              <input
                id="beta-access-code"
                type={showAccessCode ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={accessCode}
                onChange={(ev) => {
                  setAccessCode(ev.target.value);
                  setCodeError(null);
                }}
                disabled={codeSubmitting}
                style={{
                  ...inputBase,
                  width: "100%",
                  maxWidth: "100%",
                  paddingRight: 48,
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                className="beta-access-code-eye"
                aria-label={showAccessCode ? "Hide access code" : "Show access code"}
                onClick={() => setShowAccessCode((v) => !v)}
                disabled={codeSubmitting}
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {showAccessCode ? <EyeOff size={18} strokeWidth={2} aria-hidden /> : <Eye size={18} strokeWidth={2} aria-hidden />}
              </button>
            </div>
            {codeError ? (
              <p style={{ color: "#e8a598", fontSize: 13, margin: "4px 0 10px" }}>{codeError}</p>
            ) : null}
            <button type="submit" disabled={codeSubmitting} style={secondaryBtn}>
              Enter
            </button>
          </form>

          <div style={{ margin: "20px 0 18px", width: "100%", maxWidth: "100%" }}>
            <div
              style={{
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(140,155,125,0.42), transparent)",
                marginBottom: 14,
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(190, 200, 180, 0.9)",
                textAlign: "center",
                lineHeight: 1.45,
              }}
            >
              Don&apos;t have an access code yet?
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                fontWeight: 700,
                color: "rgba(232, 234, 230, 0.98)",
                textAlign: "center",
                lineHeight: 1.45,
              }}
            >
              Join the waitlist
            </p>
            <div
              style={{
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(140,155,125,0.42), transparent)",
                marginTop: 14,
              }}
            />
          </div>

          {!waitlistSubmitted ? (
            <form onSubmit={handleWaitlistSubmit} style={{ marginBottom: 8 }}>
              <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="wait-first" style={labelStyle}>
                    First Name (required)
                  </label>
                  <input
                    id="wait-first"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={waitlistSubmitting}
                    style={inputBase}
                  />
                </div>
                <div>
                  <label htmlFor="wait-last" style={labelStyle}>
                    Last Name (required)
                  </label>
                  <input
                    id="wait-last"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={waitlistSubmitting}
                    style={inputBase}
                  />
                </div>
                <div>
                  <label htmlFor="wait-email" style={labelStyle}>
                    Email (required)
                  </label>
                  <input
                    id="wait-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={waitlistSubmitting}
                    style={inputBase}
                  />
                </div>
                <div>
                  <label htmlFor="wait-service" style={labelStyle}>
                    Service branch (required)
                  </label>
                  <select
                    id="wait-service"
                    required
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    disabled={waitlistSubmitting}
                    style={selectBase}
                  >
                    <option value="">Select branch</option>
                    {WAITLIST_SERVICE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {waitlistError ? (
                <p style={{ color: "#e8a598", fontSize: 13, margin: "0 0 10px" }}>{waitlistError}</p>
              ) : null}
              <button type="submit" disabled={waitlistSubmitting} style={primaryBtn}>
                Join Waitlist
              </button>
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 12,
                  color: "rgba(170, 180, 165, 0.85)",
                  textAlign: "center",
                  lineHeight: 1.45,
                }}
              >
                No spam. Just one email when doors open.
              </p>
            </form>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "16px 12px 18px",
                marginBottom: 8,
                borderRadius: 12,
                background: "rgba(30, 38, 28, 0.6)",
                border: "1px solid rgba(140, 155, 125, 0.25)",
              }}
            >
              <p style={{ fontSize: 16, lineHeight: 1.65, color: "rgba(220, 225, 215, 0.95)", margin: 0 }}>
                {WAITLIST_THANK_YOU}
              </p>
            </div>
          )}
          <p
            style={{
              margin: "14px 0 0",
              fontSize: 12,
              lineHeight: 1.5,
              color: "rgba(190, 200, 180, 0.86)",
              textAlign: "center",
            }}
          >
            If you experience any login issues please email{" "}
            <a
              href="mailto:hello@eod-hub.com"
              style={{ color: "#d4c45c", fontWeight: 700, textDecoration: "none" }}
            >
              hello@eod-hub.com
            </a>
          </p>
          <p
            style={{
              marginTop: 20,
              marginBottom: 0,
              paddingTop: 16,
              borderTop: "1px solid rgba(140, 155, 125, 0.2)",
              fontSize: 11,
              lineHeight: 1.55,
              color: "rgba(160, 170, 155, 0.82)",
              textAlign: "center",
            }}
          >
            {BETA_PRICING_FOOTNOTE}
          </p>
          </>
          )}
        </div>
      </div>
    </>
  );

  return modalTree;
}
