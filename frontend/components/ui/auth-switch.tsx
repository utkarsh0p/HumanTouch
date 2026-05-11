"use client";

import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Globe,
  LockKeyhole,
  LogIn,
  Mail,
  Sparkles,
  UserRound,
  UserRoundPlus,
} from "lucide-react";

import { cn } from "@/lib/utils";

type LoginValues = {
  email: string;
  password: string;
};

type SignupValues = {
  fullName: string;
  email: string;
  password: string;
};

type AuthSwitchProps = {
  isLoading?: boolean;
  initialMode?: "signin" | "signup";
  onLogin: (values: LoginValues) => Promise<string | null | void>;
  onSignup: (values: SignupValues) => Promise<string | null | void>;
};

export function AuthSwitch({
  isLoading = false,
  initialMode = "signin",
  onLogin,
  onSignup,
}: AuthSwitchProps) {
  const [isSignUp, setIsSignUp] = useState(initialMode === "signup");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [isSignUp]);

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextError =
      (await onLogin({
        email: loginEmail.trim(),
        password: loginPassword,
      })) ?? null;

    if (nextError) {
      setError(nextError);
    }
  }

  async function handleSignupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextError =
      (await onSignup({
        fullName: signupName.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
      })) ?? null;

    if (nextError) {
      setError(nextError);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(217,119,87,0.18),_transparent_32%),linear-gradient(180deg,_#1d1b18_0%,_#171512_100%)] px-4 py-8 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:36px_36px] opacity-25" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className={cn("ht-auth-shell", isSignUp && "ht-auth-shell-signup")}>
          <div className="ht-auth-forms">
            <div className="ht-auth-stack">
              <form className="ht-auth-form ht-auth-form-signin" onSubmit={handleLoginSubmit}>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#b7afa0]">
                  <Sparkles className="size-3.5 text-[#d97757]" />
                  HumanTouch Workspace
                </div>
                <h1 className="ht-auth-title">Sign in</h1>
                <p className="ht-auth-copy">
                  Log in as an employee by default. Use the seeded admin account when you need control-room access.
                </p>
                <div className="ht-auth-field">
                  <Mail className="size-4.5 text-[#867d70]" />
                  <input
                    autoComplete="email"
                    onChange={(event) => setLoginEmail(event.target.value)}
                    placeholder="Email"
                    type="email"
                    value={loginEmail}
                  />
                </div>
                <div className="ht-auth-field">
                  <LockKeyhole className="size-4.5 text-[#867d70]" />
                  <input
                    autoComplete="current-password"
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="Password"
                    type="password"
                    value={loginPassword}
                  />
                </div>
                <button className="ht-auth-button" disabled={isLoading} type="submit">
                  <LogIn className="size-4" />
                  {isLoading ? "Signing in..." : "Login"}
                </button>
                <div className="mt-4 rounded-[1.35rem] border border-[#3f3a34] bg-[#211f1b] px-4 py-3 text-left">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8d8578]">Admin seed</p>
                  <p className="mt-2 text-sm text-[#ede5d9]">Utkarsh Singh</p>
                  <p className="text-sm text-[#b7afa0]">utkarshsingh@gmail.com</p>
                  <p className="text-sm text-[#b7afa0]">Password: utkarshsingh</p>
                </div>
              </form>

              <form className="ht-auth-form ht-auth-form-signup" onSubmit={handleSignupSubmit}>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#b7afa0]">
                  <UserRoundPlus className="size-3.5 text-[#d97757]" />
                  New Employee
                </div>
                <h2 className="ht-auth-title">Sign up</h2>
                <p className="ht-auth-copy">
                  Create a regular employee account. Admin access stays reserved for the seeded admin user.
                </p>
                <div className="ht-auth-field">
                  <UserRound className="size-4.5 text-[#867d70]" />
                  <input
                    autoComplete="name"
                    onChange={(event) => setSignupName(event.target.value)}
                    placeholder="Full name"
                    type="text"
                    value={signupName}
                  />
                </div>
                <div className="ht-auth-field">
                  <Mail className="size-4.5 text-[#867d70]" />
                  <input
                    autoComplete="email"
                    onChange={(event) => setSignupEmail(event.target.value)}
                    placeholder="Email"
                    type="email"
                    value={signupEmail}
                  />
                </div>
                <div className="ht-auth-field">
                  <LockKeyhole className="size-4.5 text-[#867d70]" />
                  <input
                    autoComplete="new-password"
                    onChange={(event) => setSignupPassword(event.target.value)}
                    placeholder="Password"
                    type="password"
                    value={signupPassword}
                  />
                </div>
                <button className="ht-auth-button" disabled={isLoading} type="submit">
                  <UserRoundPlus className="size-4" />
                  {isLoading ? "Creating account..." : "Create account"}
                </button>
              </form>
            </div>
          </div>

          <div className="ht-auth-panels">
            <div className="ht-auth-panel ht-auth-panel-left">
              <div className="ht-auth-panel-copy">
                <h3>New here?</h3>
                <p>
                  Create an employee account, get assigned agents later, and keep your sessions saved in the workspace.
                </p>
                <button
                  className="ht-auth-ghost"
                  onClick={() => setIsSignUp(true)}
                  type="button"
                >
                  Sign up
                </button>
              </div>
            </div>

            <div className="ht-auth-panel ht-auth-panel-right">
              <div className="ht-auth-panel-copy">
                <h3>Already onboarded?</h3>
                <p>
                  Sign in to open your assigned agents and continue existing conversations from where you left off.
                </p>
                <button
                  className="ht-auth-ghost"
                  onClick={() => setIsSignUp(false)}
                  type="button"
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>

          <div className="ht-auth-footer">
            <div className="ht-auth-socials">
              <span className="ht-auth-social">
                <Mail className="size-4" />
              </span>
              <span className="ht-auth-social">
                <Globe className="size-4" />
              </span>
              <span className="ht-auth-social">
                <BriefcaseBusiness className="size-4" />
              </span>
            </div>
            {error ? <p className="text-sm text-[#f0a487]">{error}</p> : null}
          </div>
        </div>
      </div>

      <style>{`
        .ht-auth-shell {
          --ht-circle-left: 50%;
          --ht-circle-width: 128%;
          --ht-circle-height: 175%;
          --ht-circle-mobile-bottom: 69%;
          --ht-circle-mobile-size: clamp(64rem, 155vw, 90rem);
          --ht-circle-translate: translateY(-50%);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-around;
          gap: 2.5rem;
          width: 100%;
          max-width: 1040px;
          min-height: 680px;
          overflow: hidden;
          padding: 3.25rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 34px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
            #1d1b18;
          box-shadow:
            0 40px 120px rgba(0, 0, 0, 0.45),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .ht-auth-shell::before {
          content: "";
          position: absolute;
          top: 50%;
          left: var(--ht-circle-left);
          width: var(--ht-circle-width);
          height: var(--ht-circle-height);
          border-radius: 50%;
          background: linear-gradient(160deg, #d97757 0%, #a34c2f 52%, #6b2f23 100%);
          transform: var(--ht-circle-translate);
          transition: left 1s ease, transform 1s ease;
          z-index: 1;
          opacity: 0.97;
        }

        .ht-auth-shell-signup::before {
          left: -68%;
          width: 118%;
        }

        .ht-auth-shell-signup {
          flex-direction: row-reverse;
        }

        .ht-auth-forms {
          position: relative;
          z-index: 3;
          display: flex;
          flex: 1 1 0;
          min-width: 0;
          align-items: center;
          justify-content: center;
          min-height: 100%;
          padding-left: 2.5rem;
        }

        .ht-auth-shell-signup .ht-auth-forms {
          z-index: 3;
          padding-left: 0;
        }

        .ht-auth-stack {
          position: relative;
          display: grid;
          width: min(100%, 31rem);
        }

        .ht-auth-form {
          grid-column: 1 / 2;
          grid-row: 1 / 2;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 2.4rem 2.3rem;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 30px;
          background: rgba(17, 15, 13, 0.34);
          backdrop-filter: blur(18px);
          box-shadow:
            0 28px 80px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          transition: opacity 0.45s ease, transform 0.45s ease;
        }

        .ht-auth-form-signup {
          opacity: 0;
          pointer-events: none;
          transform: translateY(16px);
        }

        .ht-auth-shell-signup .ht-auth-form-signup {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .ht-auth-shell-signup .ht-auth-form-signin {
          opacity: 0;
          pointer-events: none;
          transform: translateY(-16px);
        }

        .ht-auth-title {
          margin: 0;
          font-family: var(--font-display);
          font-size: clamp(2.4rem, 3.6vw, 4rem);
          line-height: 0.98;
          letter-spacing: -0.05em;
          color: #f1eadf;
        }

        .ht-auth-copy {
          margin: 0.9rem 0 1.6rem;
          max-width: 25rem;
          color: #b6ae9f;
          font-size: 0.98rem;
          line-height: 1.6;
        }

        .ht-auth-field {
          display: grid;
          grid-template-columns: 1.25rem minmax(0, 1fr);
          align-items: center;
          gap: 0.95rem;
          width: 100%;
          margin: 0.55rem 0;
          padding: 0 1.25rem;
          height: 3.7rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
        }

        .ht-auth-field:focus-within {
          border-color: rgba(217, 119, 87, 0.45);
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 0 0 4px rgba(217, 119, 87, 0.12);
        }

        .ht-auth-field input {
          width: 100%;
          border: 0;
          outline: none;
          background: transparent;
          color: #f5eee4;
        }

        .ht-auth-field input::placeholder {
          color: #80786b;
        }

        .ht-auth-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          width: 100%;
          margin-top: 1rem;
          height: 3.5rem;
          border: 0;
          border-radius: 999px;
          background: #f1ede6;
          color: #181714;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .ht-auth-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
        }

        .ht-auth-button:disabled {
          opacity: 0.7;
          cursor: wait;
          transform: none;
        }

        .ht-auth-panels {
          position: relative;
          display: flex;
          flex: 1 1 0;
          min-height: 20rem;
          min-width: 0;
          align-items: center;
          justify-content: center;
          z-index: 4;
          pointer-events: none;
        }

        .ht-auth-panel {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          text-align: center;
        }

        .ht-auth-panel-copy {
          max-width: 24.5rem;
          width: 100%;
          padding: 2.25rem 2rem;
          color: #fff5ee;
          opacity: 1;
          transition: transform 0.9s ease, opacity 0.35s ease;
          pointer-events: auto;
        }

        .ht-auth-panel-copy h3 {
          margin: 0 0 0.7rem;
          font-family: var(--font-display);
          font-size: 2.4rem;
          line-height: 0.95;
          letter-spacing: -0.04em;
        }

        .ht-auth-panel-copy p {
          margin: 0 0 1.5rem;
          color: rgba(255, 245, 238, 0.82);
          font-size: 1.02rem;
          line-height: 1.7;
        }

        .ht-auth-panel-left {
          justify-content: center;
        }

        .ht-auth-panel-right {
          justify-content: center;
        }

        .ht-auth-panel-right .ht-auth-panel-copy {
          transform: translateX(24px);
          opacity: 0;
          pointer-events: none;
        }

        .ht-auth-shell-signup .ht-auth-panel-left .ht-auth-panel-copy {
          transform: translateX(-24px);
          opacity: 0;
          pointer-events: none;
        }

        .ht-auth-shell-signup .ht-auth-panel-right .ht-auth-panel-copy {
          transform: translateX(0);
          opacity: 1;
          pointer-events: auto;
        }

        .ht-auth-ghost {
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.02);
          color: #fffaf4;
          padding: 0.95rem 1.5rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .ht-auth-ghost:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-1px);
        }

        .ht-auth-footer {
          position: absolute;
          left: 3.25rem;
          right: 3.25rem;
          bottom: 1.3rem;
          z-index: 5;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
        }

        .ht-auth-socials {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.5rem;
        }

        .ht-auth-social {
          display: inline-flex;
          height: 2.5rem;
          width: 2.5rem;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          color: #cfc7ba;
        }

        @media (max-width: 980px) {
          .ht-auth-shell {
            --ht-circle-left: 50%;
            --ht-circle-width: var(--ht-circle-mobile-size);
            --ht-circle-height: var(--ht-circle-mobile-size);
            --ht-circle-translate: translateX(-50%);
          }

          .ht-auth-shell {
            display: block;
            min-height: 920px;
            padding: 2rem 0 5rem;
          }

          .ht-auth-shell::before,
          .ht-auth-shell-signup::before {
            top: auto;
            left: var(--ht-circle-left);
            right: auto;
            bottom: var(--ht-circle-mobile-bottom);
            width: var(--ht-circle-width);
            height: var(--ht-circle-height);
            transform: var(--ht-circle-translate);
          }

          .ht-auth-shell-signup::before {
            bottom: -31%;
          }

          .ht-auth-forms,
          .ht-auth-panels {
            display: block;
            width: 100%;
          }

          .ht-auth-forms,
          .ht-auth-shell-signup .ht-auth-forms {
            padding-left: 0;
          }

          .ht-auth-stack {
            width: 100%;
            max-width: 38rem;
            margin: 0 auto;
          }

          .ht-auth-form {
            padding: 2.2rem 1.9rem;
          }

          .ht-auth-panels {
            min-height: 16rem;
            margin-bottom: 2rem;
          }

          .ht-auth-panel {
            position: absolute;
            inset: 0;
            padding: 0 1.8rem;
          }

          .ht-auth-panel-left,
          .ht-auth-panel-right {
            justify-content: center;
          }

          .ht-auth-panel-right .ht-auth-panel-copy {
            transform: translateY(24px);
            opacity: 0;
            pointer-events: none;
          }

          .ht-auth-shell-signup .ht-auth-panel-left .ht-auth-panel-copy {
            transform: translateY(-24px);
            opacity: 0;
            pointer-events: none;
          }

          .ht-auth-shell-signup .ht-auth-panel-right .ht-auth-panel-copy {
            transform: translateY(0);
            opacity: 1;
            pointer-events: auto;
          }
        }

        @media (max-width: 640px) {
          .ht-auth-shell {
            min-height: 960px;
            border-radius: 28px;
            padding-bottom: 4.75rem;
          }

          .ht-auth-form {
            padding: 2rem 1.1rem;
          }

          .ht-auth-copy {
            font-size: 0.94rem;
          }

          .ht-auth-panel-copy {
            padding: 1.8rem 1.35rem;
          }

          .ht-auth-panel-copy h3 {
            font-size: 1.8rem;
          }

          .ht-auth-footer {
            left: 1.1rem;
            right: 1.1rem;
          }
        }
      `}</style>
    </div>
  );
}
