"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client-api";

const DEMO = [
  { label: "agent", email: "agent1@triagedesk.in" },
  { label: "supervisor", email: "supervisor@triagedesk.in" },
  { label: "admin", email: "admin@triagedesk.in" },
];

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", "POST", { email, password });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Sign in</h1>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Signing in..." : "Sign in"}</button>
      <div className="demo-accounts">
        Demo accounts (password <span className="mono">Triage@123</span>):{" "}
        {DEMO.map((d, i) => (
          <span key={d.email}>
            <button type="button" onClick={() => { setEmail(d.email); setPassword("Triage@123"); }}>{d.label}</button>
            {i < DEMO.length - 1 ? ", " : ""}
          </span>
        ))}
      </div>
    </form>
  );
}
