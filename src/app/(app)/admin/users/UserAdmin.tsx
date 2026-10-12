"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client-api";
import { fmtDateTime } from "@/lib/format";

type U = { user_id: number; full_name: string; email: string; role: string; is_active: boolean; max_open_cases: number; last_login_at: string | null; open_cases: number };

export function UserAdmin({ users, me }: { users: U[]; me: number }) {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "agent", max_open_cases: 15 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true); setError(null); setOk(null);
    try { await fn(); setOk(label); router.refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {ok && <div className="alert alert-info" role="status">{ok}</div>}
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="num">Open cases</th><th className="num">Capacity</th><th>Last sign-in</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
                  <td>{u.full_name}{u.user_id === me ? " (you)" : ""}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={busy || u.user_id === me} style={{ width: "auto", paddingBlock: 3 }}
                      onChange={(e) => run("Role updated.", () => api(`/api/users/${u.user_id}`, "PATCH", { role: e.target.value }))}>
                      <option value="agent">agent</option><option value="supervisor">supervisor</option><option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="num">{u.open_cases}</td>
                  <td className="num">
                    <input type="number" min={1} max={50} defaultValue={u.max_open_cases} disabled={busy} style={{ width: 70 }}
                      onBlur={(e) => Number(e.target.value) !== u.max_open_cases &&
                        run("Capacity updated.", () => api(`/api/users/${u.user_id}`, "PATCH", { max_open_cases: Number(e.target.value) }))} />
                  </td>
                  <td className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : "never"}</td>
                  <td>
                    {u.user_id !== me && (
                      <button className={`btn btn-sm ${u.is_active ? "btn-danger" : ""}`} disabled={busy}
                        onClick={() => run(u.is_active ? "User deactivated; their open cases were reassigned." : "User reactivated.",
                          () => api(`/api/users/${u.user_id}`, "PATCH", { is_active: !u.is_active }))}>
                        {u.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Add a user</h2></div>
        <form className="panel-body stack" onSubmit={(e) => {
          e.preventDefault();
          run("User added.", async () => {
            await api("/api/users", "POST", form);
            setForm({ full_name: "", email: "", password: "", role: "agent", max_open_cases: 15 });
          });
        }}>
          <div className="row">
            <label className="field"><span>Name</span><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
            <label className="field"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label className="field"><span>Temporary password</span><input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" /></label>
          </div>
          <div className="row">
            <label className="field"><span>Role</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="agent">agent</option><option value="supervisor">supervisor</option><option value="admin">admin</option>
              </select>
            </label>
            <label className="field"><span>Case capacity</span>
              <input type="number" min={1} max={50} value={form.max_open_cases} onChange={(e) => setForm({ ...form, max_open_cases: Number(e.target.value) })} />
            </label>
          </div>
          <div className="actions"><button className="btn btn-primary" disabled={busy}>Add user</button></div>
        </form>
      </section>
    </div>
  );
}
