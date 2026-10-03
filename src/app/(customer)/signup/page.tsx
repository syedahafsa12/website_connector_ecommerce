"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const { signup, status } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/app");
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signup(email, password, fullName || undefined);
      if (result.requiresEmailConfirmation) {
        setNeedsConfirmation(true);
      } else {
        router.push("/app");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (needsConfirmation) {
    return (
      <div className="am-auth-shell">
        <div className="am-auth-card">
          <div className="am-brand" style={{ marginBottom: 20 }}>
            <span className="am-brand-dot" />
            Agent Mall
          </div>
          <h1 className="am-auth-title">Check your email</h1>
          <p className="am-auth-subtitle">
            We sent a confirmation link to <strong>{email}</strong>. Confirm your address, then sign in.
          </p>
          <Link href="/login" className="am-btn am-btn-primary am-btn-block" style={{ textDecoration: "none" }}>
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="am-auth-shell">
      <div className="am-auth-card">
        <div className="am-brand" style={{ marginBottom: 20 }}>
          <span className="am-brand-dot" />
          Agent Mall
        </div>
        <h1 className="am-auth-title">Create your account</h1>
        <p className="am-auth-subtitle">One agent, every connected store.</p>

        <form onSubmit={onSubmit}>
          <div className="am-field">
            <label className="am-label" htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              className="am-input"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="am-field">
            <label className="am-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="am-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="am-field">
            <label className="am-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="am-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="am-help-text">At least 8 characters.</span>
          </div>

          {error && <p className="am-error-text" role="alert">{error}</p>}

          <button className="am-btn am-btn-primary am-btn-block" type="submit" disabled={busy}>
            {busy ? <span className="am-spinner" /> : "Create account"}
          </button>
        </form>

        <p className="am-auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
