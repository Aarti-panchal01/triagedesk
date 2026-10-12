import Link from "next/link";
import { requirePageSession, isLead } from "@/lib/auth";
import { getDashboard } from "@/lib/data";
import { CaseList } from "@/components/CaseList";
import { SeverityBadge } from "@/components/badges";
import { fmtDateTime, fmtHours, timeAgo } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const s = await requirePageSession();
  const lead = isLead(s);
  const { denied } = await searchParams;
  const d = await getDashboard(s.userId, lead);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good to see you, {s.name.split(" ")[0]}</h1>
          <p>{lead ? "Floor overview and open escalations." : "Your queue and anything that needs a callback."}</p>
        </div>
        <Link className="btn btn-primary" href="/cases/new">Log a new call</Link>
      </div>

      {denied && <div className="alert alert-error" style={{ marginBottom: 16 }}>That page needs a different role.</div>}

      <div className="tally">
        <div><div className="n">{d.counts.active}</div><div className="l">Active cases</div></div>
        <div className="is-critical"><div className="n">{d.counts.critical}</div><div className="l">Critical, not closed</div></div>
        <div><div className="n">{d.counts.escalated}</div><div className="l">Escalated</div></div>
        <div><div className="n">{d.counts.opened_today}</div><div className="l">Calls today</div></div>
        <div><div className="n">{d.counts.closed_today}</div><div className="l">Closed today</div></div>
      </div>

      <div className="grid-main">
        <div className="stack">
          {!lead && (
            <section className="panel">
              <div className="panel-head"><h2>My open cases</h2><Link className="small" href={`/cases?mine=1&status=active`}>See all</Link></div>
              <CaseList rows={d.mine} empty="No open cases assigned to you." />
            </section>
          )}
          {lead && (
            <section className="panel">
              <div className="panel-head"><h2>Agent workload</h2><span className="hint">from v_agent_workload</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Agent</th><th className="num">Open</th><th className="num">High or critical</th><th className="num">Capacity</th><th className="num">Closed, 30 days</th><th className="num">Avg resolution</th></tr></thead>
                  <tbody>
                    {d.workload.map((w) => (
                      <tr key={w.user_id}>
                        <td>{w.full_name}</td>
                        <td className="num">{w.open_cases}</td>
                        <td className="num">{w.urgent_open}</td>
                        <td className="num">{w.open_cases}/{w.max_open_cases}</td>
                        <td className="num">{w.closed_30d}</td>
                        <td className="num">{fmtHours(w.avg_resolution_hours_30d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-head"><h2>Latest calls</h2><Link className="small" href="/cases">All cases</Link></div>
            <CaseList rows={d.recent} empty="No calls logged yet." />
          </section>
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Open escalations</h2></div>
            {d.escalations.length === 0 ? (
              <div className="empty">Nothing escalated right now.</div>
            ) : (
              <ul className="timeline">
                {d.escalations.map((e) => (
                  <li key={e.escalation_id}>
                    <div className="actions" style={{ justifyContent: "space-between" }}>
                      <Link href={`/cases/${e.case_id}`} className="mono">{e.case_ref}</Link>
                      <SeverityBadge severity={e.severity} />
                    </div>
                    <div className="body">{e.chief_complaint}</div>
                    <div className="who">{e.reason} / {e.status} / {timeAgo(e.created_at)}{e.supervisor_name ? ` / ${e.supervisor_name}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Callbacks due</h2><span className="hint">next 24 h and overdue</span></div>
            {d.followUps.length === 0 ? (
              <div className="empty">No callbacks due.</div>
            ) : (
              <ul className="timeline">
                {d.followUps.map((f) => (
                  <li key={f.follow_up_id}>
                    <Link href={`/cases/${f.case_id}`} className="mono">{f.case_ref}</Link>{" "}
                    <span>{f.caller_name}, {f.caller_phone}</span>
                    <div className="who" style={{ color: new Date(f.scheduled_for) < new Date() ? "var(--sev-high)" : undefined }}>
                      {fmtDateTime(f.scheduled_for)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
