"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/app");
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.push("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="am-auth-shell">
      <div className="am-auth-card">
        <div className="am-brand" style={{ marginBottom: 20 }}>
          <span className="am-brand-dot" />
          Agent Mall
        </div>
        <h1 className="am-auth-title">Welcome back</h1>
        <p className="am-auth-subtitle">Sign in to let your agent shop across every connected store.</p>

        <form onSubmit={onSubmit}>
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="am-error-text" role="alert">{error}</p>}

          <button className="am-btn am-btn-primary am-btn-block" type="submit" disabled={busy}>
            {busy ? <span className="am-spinner" /> : "Sign in"}
          </button>
        </form>

        <p className="am-auth-switch">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
