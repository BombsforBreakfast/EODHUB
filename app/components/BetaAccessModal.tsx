// TEMPORARY BETA GATE
// Remove after public launch (30–45 days)

"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import EodCrabLogo from "@/app/components/EodCrabLogo";

const STORAGE_KEY = "beta_access_granted";

const WAITLIST_THANK_YOU =
  "Thanks — you're on the waitlist. You'll receive an email when the doors open.";

type WaitlistRow = {
  first_name: string;
  last_name: string;
  email: string;
  service: string;
};

function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // Practical check without going overboard
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function BetaAccessModal() {
  /** null = not yet read localStorage; true = gate blocking login; false = unlocked (valid code was used before). */
  const [showModal, setShowModal] = useState<boolean | null>(null);
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

  const expectedCode = useMemo(
    () => (process.env.NEXT_PUBLIC_BETA_ACCESS_CODE ?? "").trim(),
    [],
  );

  useLayoutEffect(() => {
    try {
      const granted = window.localStorage.getItem(STORAGE_KEY) === "true";
      setShowModal(!granted);
    } catch {
      setShowModal(true);
    }
  }, []);

  /** Only valid beta code may persist and hide the modal. */
  const unlockWithBetaCode = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore quota / private mode */
    }
    setShowModal(false);
  }, []);

  const handleCodeSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setCodeError(null);
      const entered = accessCode.trim();
      if (!entered) {
        setCodeError("That code doesn't look right. Check your invite and try again.");
        return;
      }
      if (!expectedCode) {
        setCodeError("That code doesn't look right. Check your invite and try again.");
        return;
      }
      setCodeSubmitting(true);
      try {
        if (entered === expectedCode) {
          unlockWithBetaCode();
        } else {
          setCodeError("That code doesn't look right. Check your invite and try again.");
        }
      } finally {
        setCodeSubmitting(false);
      }
    },
    [accessCode, expectedCode, unlockWithBetaCode],
  );

  const handleWaitlistSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setWaitlistError(null);
      const em = email.trim();
      if (!isValidEmail(em)) {
        setWaitlistError("Please enter a valid email address.");
        return;
      }
      setWaitlistSubmitting(true);
      try {
        const row: WaitlistRow = {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: em,
          service: service.trim(),
        };
        const { error } = await supabase.from("waitlist_signups").insert(row);
        if (error) {
          const dup = error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
          const msg = dup
            ? "That email is already on the waitlist."
            : "Something went wrong. Please try again in a moment.";
          setWaitlistError(msg);
          return;
        }
        setFirstName("");
        setLastName("");
        setEmail("");
        setService("");
        setWaitlistSubmitted(true);
      } catch {
        setWaitlistError("Something went wrong. Please try again in a moment.");
      } finally {
        setWaitlistSubmitting(false);
      }
    },
    [email, firstName, lastName, service],
  );

  if (showModal === null || !showModal) {
    return null;
  }

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
    cursor: waitlistSubmitting || codeSubmitting ? "not-allowed" : "pointer",
    opacity: waitlistSubmitting || codeSubmitting ? 0.65 : 1,
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
            overflowY: "auto",
            borderRadius: 16,
            border: "1px solid rgba(140, 155, 125, 0.35)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",
            background: "linear-gradient(165deg, rgba(22, 26, 22, 0.98) 0%, rgba(10, 12, 14, 0.99) 100%)",
            padding: "28px 24px 26px",
            animation: "betaGatePopIn 380ms ease-out 40ms both",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div
              className="beta-gate-title"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: 2,
                color: "#e8eae6",
                lineHeight: 1.1,
              }}
            >
              EOD HUB
            </div>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              <div style={{ transform: "scale(0.72)", transformOrigin: "center top" }}>
                <EodCrabLogo variant="login" priority />
              </div>
            </div>
            <div
              id="beta-gate-heading"
              className="beta-gate-sticker"
              style={{
                display: "inline-block",
                marginTop: 4,
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
              It&apos;s Coming
            </div>
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: "rgba(220, 225, 215, 0.92)",
              marginBottom: 22,
              textAlign: "center",
            }}
          >
            <p style={{ margin: "0 0 12px" }}>
              EOD-HUB is entering Beta.
              <br />
              Access is currently limited.
            </p>
            <p style={{ margin: 0 }}>
              If you were issued an early access code, enter it below.
              <br />
              Otherwise, join the waitlist and we&apos;ll notify you when access opens.
            </p>
          </div>

          <form onSubmit={handleCodeSubmit} style={{ marginBottom: 26 }}>
            <label htmlFor="beta-access-code" style={labelStyle}>
              Access Code
            </label>
            <div style={{ position: "relative", width: "100%", marginBottom: 6 }}>
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
            <button type="submit" disabled={codeSubmitting} style={primaryBtn}>
              Enter
            </button>
          </form>

          <div
            style={{
              height: 1,
              background: "linear-gradient(90deg, transparent, rgba(140,155,125,0.4), transparent)",
              margin: "8px 0 22px",
            }}
          />

          {!waitlistSubmitted ? (
            <form onSubmit={handleWaitlistSubmit}>
              <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
                <div>
                  <label htmlFor="wait-first" style={labelStyle}>
                    First Name
                  </label>
                  <input
                    id="wait-first"
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={waitlistSubmitting}
                    style={inputBase}
                  />
                </div>
                <div>
                  <label htmlFor="wait-last" style={labelStyle}>
                    Last Name
                  </label>
                  <input
                    id="wait-last"
                    type="text"
                    autoComplete="family-name"
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
                    Service
                  </label>
                  <input
                    id="wait-service"
                    type="text"
                    placeholder="e.g. Army, Navy EOD, Veteran"
                    autoComplete="organization-title"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    disabled={waitlistSubmitting}
                    style={inputBase}
                  />
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
                padding: "16px 12px 8px",
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
        </div>
      </div>
    </>
  );

  return createPortal(modalTree, document.body);
}
