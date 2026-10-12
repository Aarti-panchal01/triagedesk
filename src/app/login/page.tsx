import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="login-wrap">
      <section className="login-side">
        <div>
          <div className="wordmark" style={{ color: "inherit" }}>
            <span className="wordmark-mark" style={{ background: "var(--brand-ink)", color: "var(--brand)" }} aria-hidden>TD</span>
            TriageDesk
          </div>
        </div>
        <div>
          <div className="big">Every call starts with the last one like it.</div>
          <p>
            Log helpline calls, see how similar cases were resolved, and keep escalations moving.
            Built on PostgreSQL with pgvector.
          </p>
        </div>
        <p className="small">DBMS Level 3 mini project, PES University</p>
      </section>
      <section className="login-form">
        <LoginForm next={next?.startsWith("/") ? next : "/dashboard"} />
      </section>
    </main>
  );
}
