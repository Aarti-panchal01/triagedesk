import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession, isLead } from "@/lib/auth";
import {
  getCallerHistory, getCase, getCaseAudit, getCaseEscalations, getCaseFollowUps,
  getCaseNotes, getCaseSymptomIds, getSimilarToCase, listActiveAgents, listProtocols,
} from "@/lib/data";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { fmtDateTime, fmtHours } from "@/lib/format";
import { CaseActions } from "./CaseActions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `Case ${(await params).id}` };
}

const GENDER: Record<string, string> = { M: "Male", F: "Female", O: "Other" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePageSession();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const c = await getCase(id);
  if (!c) notFound();

  const lead = isLead(s);
  const canEdit = lead || c.assigned_to === s.userId;
  const [symptoms, notes, escalations, followUps, similar, history, audit, agents, protocols] = await Promise.all([
    getCaseSymptomIds(id), getCaseNotes(id), getCaseEscalations(id), getCaseFollowUps(id),
    getSimilarToCase(id), getCallerHistory(c.caller_id, id),
    lead ? getCaseAudit(id) : Promise.resolve([]),
    lead ? listActiveAgents() : Promise.resolve([]),
    listProtocols(),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="mono" style={{ marginTop: 0 }}><Link href="/cases">Cases</Link> / {c.case_ref}</p>
        </div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <section className={`panel case-hero sev sev-${c.severity}`}>
            <div className="actions">
              <SeverityBadge severity={c.severity} />
              <StatusBadge status={c.status} />
              <span className="badge status">{c.category}</span>
              {c.applied_protocol_code && <Link className="badge status" href={`/protocols/${c.applied_protocol_id}`}>Protocol {c.applied_protocol_code}</Link>}
            </div>
            <h1 className="complaint">{c.chief_complaint}</h1>
            <dl className="facts">
              <div><dt>Caller</dt><dd>{c.caller_name}</dd></div>
              <div><dt>Phone</dt><dd className="mono">{c.caller_phone}</dd></div>
              <div><dt>Age, gender</dt><dd>{c.caller_age ?? "n/a"}{c.caller_gender ? `, ${GENDER[c.caller_gender]}` : ""}</dd></div>
              <div><dt>District</dt><dd>{c.district ?? "n/a"}</dd></div>
              <div><dt>Language</dt><dd>{c.preferred_language}</dd></div>
              <div><dt>Assigned to</dt><dd>{c.assigned_name ?? "Unassigned"}</dd></div>
              <div><dt>Opened</dt><dd>{fmtDateTime(c.opened_at)} by {c.created_by_name}</dd></div>
              <div><dt>{c.closed_at ? "Time to close" : "Open for"}</dt><dd>{fmtHours(c.age_hours)}</dd></div>
            </dl>
            {symptoms.length > 0 && (
              <div className="chips" style={{ marginTop: 14 }}>
                {symptoms.map((x) => (
                  <span key={x.symptom_id} className={`badge ${x.is_red_flag ? "sev sev-high" : "status"}`}>{x.name}</span>
                ))}
              </div>
            )}
            {c.resolution_notes && (
              <div className="alert alert-info" style={{ marginTop: 16 }}>
                <strong>Resolution.</strong> {c.resolution_notes}
              </div>
            )}
          </section>

          <CaseActions
            caseId={c.case_id}
            status={c.status}
            severity={c.severity}
            canEdit={canEdit}
            lead={lead}
            appliedProtocolId={c.applied_protocol_id}
            agents={agents.filter((a) => a.user_id !== c.assigned_to)}
            protocols={protocols.filter((p) => p.is_active).map((p) => ({ id: p.protocol_id, label: `${p.code}: ${p.title}` }))}
            escalations={escalations.filter((e) => e.status !== "resolved").map((e) => ({ id: e.escalation_id, status: e.status }))}
            followUps={followUps.filter((f) => !f.completed_at).map((f) => ({ id: f.follow_up_id, at: f.scheduled_for.toISOString() }))}
          />

          <section className="panel">
            <div className="panel-head"><h2>Case log</h2><span className="hint">{notes.length} entries</span></div>
            <ul className="timeline">
              {notes.map((n) => (
                <li key={n.note_id} className={n.note_type === "system" ? "system" : ""}>
                  <div className="who"><span className="type">{n.note_type.replace("_", " ")}</span> / {n.author_name} / {fmtDateTime(n.created_at)}</div>
                  <div className="body">{n.body}</div>
                </li>
              ))}
            </ul>
          </section>

          {lead && audit.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Audit trail</h2><span className="hint">written by database triggers</span></div>
              <ul className="timeline">
                {audit.map((a) => (
                  <li key={a.log_id}>
                    <div className="who">
                      {a.table_name} / {{ I: "insert", U: "update", D: "delete" }[a.action]} / {a.changed_by_name ?? "system"} / {fmtDateTime(a.changed_at)}
                    </div>
                    <div className="audit-diff">{diff(a.old_data, a.new_data)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Escalations</h2></div>
            {escalations.length === 0 ? <div className="empty">Never escalated.</div> : (
              <ul className="timeline">
                {escalations.map((e) => (
                  <li key={e.escalation_id}>
                    <div className="actions"><span className={`badge ${e.status === "resolved" ? "status status-closed" : "status status-escalated"}`}>{e.status}</span></div>
                    <div className="body">{e.reason}</div>
                    <div className="who">Raised by {e.raised_by_name}, {fmtDateTime(e.created_at)}{e.supervisor_name ? `. Supervisor: ${e.supervisor_name}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Callbacks</h2></div>
            {followUps.length === 0 ? <div className="empty">No callbacks scheduled.</div> : (
              <ul className="timeline">
                {followUps.map((f) => (
                  <li key={f.follow_up_id}>
                    <div><strong>{fmtDateTime(f.scheduled_for)}</strong> {f.completed_at ? <span className="muted small">done</span> : <span className="small" style={{ color: "var(--sev-high)" }}>pending</span>}</div>
                    {f.outcome && <div className="body small">{f.outcome}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Similar resolved cases</h2><span className="hint">cosine similarity</span></div>
            {similar.length === 0 ? <div className="empty">No resolved case is similar enough yet.</div> : similar.map((m) => (
              <div className="match" key={m.case_id}>
                <div className="match-top">
                  <Link className="mono small" href={`/cases/${m.case_id}`}>{m.case_ref}</Link>
                  <span className="score">{Math.round(m.similarity * 100)}%</span>
                </div>
                <div className="meter"><i style={{ width: `${Math.max(4, m.similarity * 100)}%` }} /></div>
                <div className="what">{m.chief_complaint}</div>
                {m.resolution_notes && <div className="resolution">{m.resolution_notes}</div>}
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Other calls from this caller</h2></div>
            {history.length === 0 ? <div className="empty">First call from this number.</div> : (
              <ul className="timeline">
                {history.map((h) => (
                  <li key={h.case_id}>
                    <div className="actions"><Link className="mono small" href={`/cases/${h.case_id}`}>{h.case_ref}</Link><StatusBadge status={h.status} /></div>
                    <div className="body small">{h.chief_complaint}</div>
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

const SKIP = new Set(["updated_at", "opened_at", "created_at", "resolution_notes", "chief_complaint"]);
function diff(o: Record<string, unknown> | null, n: Record<string, unknown> | null) {
  if (!o && n) return "created";
  if (o && !n) return "deleted";
  const parts: string[] = [];
  for (const k of Object.keys(n ?? {})) {
    if (SKIP.has(k)) continue;
    if (JSON.stringify(o?.[k]) !== JSON.stringify(n?.[k])) parts.push(`${k}: ${fmt(o?.[k])} to ${fmt(n?.[k])}`);
  }
  if (o?.resolution_notes !== n?.resolution_notes) parts.push("resolution notes set");
  return parts.join("; ") || "no visible change";
}
const fmt = (v: unknown) => (v == null ? "empty" : String(v));
