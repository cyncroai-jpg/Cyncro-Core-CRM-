"use client";
import { useEffect, useState, type FormEvent } from "react";

type Mode = "login" | "setup" | "invite";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Invite-specific
  const [inviteToken, setInviteToken] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite")?.trim() ?? "";

    if (token) {
      setInviteToken(token);
      // Validate the invite token
      void fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
        .then((r) => r.json())
        .then((d: unknown) => {
          const data = d as { email?: string; displayName?: string; error?: string };
          if (data.error) {
            setError(data.error);
            setMode("login");
          } else {
            setInviteEmail(data.email ?? "");
            setDisplayName(data.displayName ?? "");
            setMode("invite");
          }
        })
        .catch(() => {
          setError("Unable to validate your invite link. Please try again.");
          setMode("login");
        })
        .finally(() => setLoading(false));
      return;
    }

    // Check if first-run setup is needed
    void fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d: unknown) => {
        const data = d as { needsSetup?: boolean };
        if (data.needsSetup) setMode("setup");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          display_name: displayName.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Setup failed.");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptInvite(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/invite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: inviteToken,
          password,
          displayName: displayName.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to accept invite.");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="loginShell">
        <div className="loginSpinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="loginShell">
      <div className="loginGlow" aria-hidden="true" />

      <div className="loginCard">
        {/* Logo */}
        <div className="loginLogo">
          <span className="loginLogoMark">Cyncro</span>
          <span className="loginLogoSub">Core</span>
        </div>

        {mode === "invite" ? (
          <>
            <div className="loginHeading">
              <p className="loginEyebrow">YOU&apos;VE BEEN INVITED</p>
              <h1>Set up your account</h1>
              <p className="loginSubtext">
                You&apos;re joining the workspace as <strong style={{ color: "#F5F0EB" }}>{inviteEmail}</strong>.
                Choose a name and create your password to get started.
              </p>
            </div>

            <form className="loginForm" onSubmit={(e) => void handleAcceptInvite(e)} noValidate>
              <div className="loginField">
                <label htmlFor="displayName">Your name</label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  placeholder="Full name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="loginField">
                <label htmlFor="inviteEmailDisplay">Email</label>
                <input
                  id="inviteEmailDisplay"
                  type="email"
                  value={inviteEmail}
                  readOnly
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </div>
              <div className="loginField">
                <label htmlFor="password">Create password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="loginField">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              {error && <p className="loginError" role="alert">{error}</p>}

              <button type="submit" className="loginSubmit" disabled={submitting}>
                {submitting ? <span className="loginBtnSpinner" /> : "Activate account"}
              </button>
            </form>
          </>
        ) : mode === "setup" ? (
          <>
            <div className="loginHeading">
              <p className="loginEyebrow">WORKSPACE SETUP</p>
              <h1>Create your owner account</h1>
              <p className="loginSubtext">
                You&apos;re the first person here. Set up your owner credentials to
                get started.
              </p>
            </div>

            <form className="loginForm" onSubmit={(e) => void handleSetup(e)} noValidate>
              <div className="loginField">
                <label htmlFor="displayName">Your name</label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  placeholder="Yvette Lomeli"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="loginField">
                <label htmlFor="email">Work email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="loginField">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="loginField">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              {error && <p className="loginError" role="alert">{error}</p>}

              <button type="submit" className="loginSubmit" disabled={submitting}>
                {submitting ? <span className="loginBtnSpinner" /> : "Create workspace"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="loginHeading">
              <p className="loginEyebrow">WELCOME BACK</p>
              <h1>Sign in to your workspace</h1>
            </div>

            <form className="loginForm" onSubmit={(e) => void handleLogin(e)} noValidate>
              <div className="loginField">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="loginField">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              {error && <p className="loginError" role="alert">{error}</p>}

              <button type="submit" className="loginSubmit" disabled={submitting}>
                {submitting ? <span className="loginBtnSpinner" /> : "Sign in"}
              </button>
            </form>
          </>
        )}

        <p className="loginFooter">
          Cyncro Core &mdash; Business operating system
        </p>
      </div>

      <style>{`
        .loginShell {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #080808;
          color: #F5F0EB;
          font-family: 'Montserrat', system-ui, sans-serif;
          padding: 24px 16px;
          overflow: hidden;
        }
        .loginGlow {
          position: absolute;
          top: -120px;
          right: -80px;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, #9A1A3022 0%, transparent 65%);
          pointer-events: none;
        }
        .loginSpinner {
          width: 36px;
          height: 36px;
          border: 3px solid #352B2E;
          border-top-color: #C1283E;
          border-radius: 50%;
          animation: loginSpin 0.8s linear infinite;
        }
        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
        .loginCard {
          position: relative;
          width: 100%;
          max-width: 440px;
          background: #0D0B0C;
          border: 1px solid #352B2E;
          border-radius: 18px;
          padding: 44px 40px 36px;
          box-shadow: 0 40px 100px #00000080, 0 0 0 1px #1a1214;
        }
        .loginLogo {
          display: flex;
          align-items: baseline;
          gap: 7px;
          margin-bottom: 36px;
        }
        .loginLogoMark {
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: #F5F0EB;
        }
        .loginLogoSub {
          font-size: 13px;
          font-weight: 500;
          color: #C1283E;
          letter-spacing: 0.04em;
        }
        .loginHeading {
          margin-bottom: 28px;
        }
        .loginEyebrow {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.16em;
          color: #C1283E;
          margin: 0 0 10px;
        }
        .loginHeading h1 {
          font-size: 22px;
          font-weight: 500;
          line-height: 1.3;
          margin: 0 0 8px;
          color: #F5F0EB;
        }
        .loginSubtext {
          font-size: 13px;
          line-height: 1.6;
          color: #B8ABAD;
          margin: 0;
        }
        .loginForm {
          display: grid;
          gap: 16px;
        }
        .loginField {
          display: grid;
          gap: 8px;
        }
        .loginField label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #B8ABAD;
        }
        .loginField input {
          height: 48px;
          width: 100%;
          background: #100E0F;
          border: 1px solid #352B2E;
          border-radius: 10px;
          color: #F5F0EB;
          font-family: inherit;
          font-size: 14px;
          padding: 0 16px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .loginField input::placeholder {
          color: #5A4E51;
        }
        .loginField input:focus {
          border-color: #C1283E;
          box-shadow: 0 0 0 3px #C1283E18;
        }
        .loginField input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .loginError {
          font-size: 13px;
          color: #E35B72;
          background: #1a0c0e;
          border: 1px solid #5a1f2a;
          border-radius: 8px;
          padding: 11px 14px;
          margin: 0;
          line-height: 1.5;
        }
        .loginSubmit {
          height: 50px;
          width: 100%;
          background: #C1283E;
          border: none;
          border-radius: 10px;
          color: #fff;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          margin-top: 4px;
          transition: background 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .loginSubmit:hover:not(:disabled) {
          background: #A8202F;
        }
        .loginSubmit:active:not(:disabled) {
          transform: scale(0.98);
        }
        .loginSubmit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .loginBtnSpinner {
          display: block;
          width: 20px;
          height: 20px;
          border: 2px solid #ffffff50;
          border-top-color: #fff;
          border-radius: 50%;
          animation: loginSpin 0.7s linear infinite;
        }
        .loginFooter {
          margin: 28px 0 0;
          font-size: 11px;
          color: #5A4E51;
          text-align: center;
          letter-spacing: 0.02em;
        }
        @media (max-width: 480px) {
          .loginCard {
            padding: 32px 22px 28px;
          }
          .loginHeading h1 {
            font-size: 19px;
          }
        }
      `}</style>
    </div>
  );
}
