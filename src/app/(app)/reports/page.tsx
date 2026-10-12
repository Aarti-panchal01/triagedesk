import { requirePageSession } from "@/lib/auth";
import { runReports } from "@/lib/reports";
import { fmtHours } from "@/lib/format";

export const metadata = { title: "Reports" };

type Row = { label: string; value: number; urgent?: number; open?: number; latest?: string; avg_hours?: number | null; assigned_name?: string | null };

export default async function ReportsPage() {
  await requirePageSession(["supervisor", "admin"]);
  const reports = await runReports();
  const byKey = Object.fromEntries(reports.map((r) => [r.key, r])) as Record<string, (typeof reports)[number]>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Every figure comes from one SQL query, shown under its chart.</p>
        </div>
      </div>
      <div className="stack">
        <ReportPanel r={byKey.daily}>
          <Columns rows={byKey.daily.rows as Row[]} />
          <div className="small muted" style={{ padding: "0 20px 12px" }}>Orange part of each bar: high or critical calls.</div>
        </ReportPanel>
        <div className="grid-2">
          <ReportPanel r={byKey.category}>
            <Bars rows={byKey.category.rows as Row[]} extra={(x) => `avg ${fmtHours(x.avg_hours)}`} />
          </ReportPanel>
          <ReportPanel r={byKey.district}><Bars rows={byKey.district.rows as Row[]} /></ReportPanel>
          <ReportPanel r={byKey.symptoms}><Bars rows={byKey.symptoms.rows as Row[]} urgent /></ReportPanel>
          <ReportPanel r={byKey.repeat}>
            <List rows={byKey.repeat.rows as Row[]} unit="calls" />
          </ReportPanel>
        </div>
        <ReportPanel r={byKey.stale}>
          <List rows={byKey.stale.rows as Row[]} unit="h open" />
        </ReportPanel>
      </div>
    </>
  );
}

function ReportPanel({ r, children }: { r: { title: string; description: string; sql: string; rows: unknown[] }; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2>{r.title}</h2><span className="hint">{r.description}</span></div>
      {r.rows.length === 0 ? <div className="empty">No rows for this report yet.</div> : children}
      <details className="sql"><summary>Show SQL</summary><pre>{r.sql}</pre></details>
    </section>
  );
}

function Bars({ rows, urgent, extra }: { rows: Row[]; urgent?: boolean; extra?: (r: Row) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar" key={r.label} title={extra?.(r)}>
          <span className="lab">{r.label}</span>
          <span className="track"><span className={`fill ${urgent ? "urgent" : ""}`} style={{ width: `${(r.value / max) * 100}%`, display: "block" }} /></span>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Columns({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <>
      <div className="columns" role="img" aria-label="Calls per day">
        {rows.map((r) => (
          <div className="col" key={r.label} title={`${r.label}: ${r.value} calls, ${r.urgent ?? 0} urgent`}>
            <span>{r.value || ""}</span>
            <i style={{ height: `${(r.value / max) * 100}%` }}>
              <b style={{ height: r.value ? `${((r.urgent ?? 0) / r.value) * 100}%` : 0 }} />
            </i>
          </div>
        ))}
      </div>
      <div className="columns-labels">{rows.map((r) => <span key={r.label}>{r.label}</span>)}</div>
    </>
  );
}

function List({ rows, unit }: { rows: Row[]; unit: string }) {
  return (
    <ul className="timeline">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <strong>{r.label}</strong><span className="small">{r.value} {unit}{r.assigned_name ? `, ${r.assigned_name}` : ""}</span>
          </div>
          {r.latest && <div className="body small muted">{r.latest}</div>}
        </li>
      ))}
    </ul>
  );
}
