"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client-api";
import { NOTE_TYPES, SEVERITIES, type Severity, type Status } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";

type Props = {
  caseId: number; status: Status; severity: Severity; canEdit: boolean; lead: boolean;
  appliedProtocolId: number | null;
  agents: { user_id: number; full_name: string; open_cases: number; max_open_cases: number }[];
  protocols: { id: number; label: string }[];
  escalations: { id: number; status: string }[];
  followUps: { id: number; at: string }[];
};

type Tab = "note" | "followup" | "escalate" | "handoff" | "close";

export function CaseActions(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("note");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [noteType, setNoteType] = useState<(typeof NOTE_TYPES)[number]>("observation");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const [agent, setAgent] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [closeProtocol, setCloseProtocol] = useState(p.appliedProtocolId?.toString() ?? "");

  async function run(label: string, fn: () => Promise<unknown>, reset?: () => void) {
    setBusy(true); setError(null); setOk(null);
    try {
      await fn();
      reset?.();
      setOk(label);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const url = `/api/cases/${p.caseId}`;

  if (p.status === "closed") return null;

  if (!p.canEdit) {
    return <div className="alert alert-info">This case is assigned to another agent. You can read it; only they or a supervisor can change it.</div>;
  }

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "note", label: "Add note", show: true },
    { key: "followup", label: "Schedule callback", show: true },
    { key: "escalate", label: "Escalate", show: p.escalations.length === 0 },
    { key: "handoff", label: "Hand off", show: true },
    { key: "close", label: "Close case", show: true },
  ];

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap" }}>
        <div className="actions" role="tablist">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} type="button"
              className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-ghost"}`} onClick={() => { setTab(t.key); setError(null); setOk(null); }}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="actions small">
          <span className="muted">Severity</span>
          <select value={p.severity} disabled={busy} style={{ width: "auto", paddingBlock: 4 }}
            onChange={(e) => run("Severity updated.", () => api(url, "PATCH", { severity: e.target.value }))}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="panel-body stack">
        {p.escalations.length > 0 && (
          <div className="alert alert-error actions" style={{ justifyContent: "space-between" }}>
            <span>Escalation {p.escalations[0].status}. {p.lead ? "Acknowledge it, or resolve it once the case is safe to continue." : "A supervisor will pick this up."}</span>
            {p.lead && (
              <span className="actions">
                {p.escalations[0].status === "pending" && (
                  <button className="btn btn-sm" disabled={busy} onClick={() => run("Escalation acknowledged.", () => api(`/api/escalations/${p.escalations[0].id}`, "PATCH", { status: "acknowledged" }))}>Acknowledge</button>
                )}
                <button className="btn btn-sm" disabled={busy} onClick={() => run("Escalation resolved.", () => api(`/api/escalations/${p.escalations[0].id}`, "PATCH", { status: "resolved" }))}>Resolve</button>
              </span>
            )}
          </div>
        )}

        {tab === "note" && (
          <>
            <div className="row">
              <label className="field"><span>Type</span>
                <select value={noteType} onChange={(e) => setNoteType(e.target.value as typeof noteType)}>
                  {NOTE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </label>
            </div>
            <label className="field"><span>Note</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What was observed, advised or agreed with the caller" />
            </label>
            <div className="actions">
              <button className="btn btn-primary" disabled={busy || note.trim().length < 3}
                onClick={() => run("Note added.", () => api(`${url}/notes`, "POST", { note_type: noteType, body: note }), () => setNote(""))}>
                Add note
              </button>
            </div>
          </>
        )}

        {tab === "followup" && (
          <>
            <label className="field" style={{ maxWidth: 280 }}><span>Call back at</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <div className="actions">
              <button className="btn btn-primary" disabled={busy || !when}
                onClick={() => run("Callback scheduled.", () => api(`${url}/follow-ups`, "POST", { scheduled_for: new Date(when).toISOString() }), () => setWhen(""))}>
                Schedule callback
              </button>
            </div>
            {p.followUps.length > 0 && (
              <div className="stack">
                {p.followUps.map((f) => <PendingFollowUp key={f.id} f={f} busy={busy} run={run} />)}
              </div>
            )}
          </>
        )}

        {tab === "escalate" && (
          <>
            <label className="field"><span>Why does a supervisor need to see this?</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </label>
            <div className="actions">
              <button className="btn btn-danger" disabled={busy || reason.trim().length < 5}
                onClick={() => run("Escalated to a supervisor.", () => api(`${url}/escalate`, "POST", { reason }), () => setReason(""))}>
                Escalate
              </button>
            </div>
          </>
        )}

        {tab === "handoff" && (
          <>
            <div className="row">
              <label className="field"><span>Hand off to</span>
                <select value={agent} onChange={(e) => setAgent(e.target.value)}>
                  <option value="">Least busy agent (picked by the database)</option>
                  {p.agents.map((a) => <option key={a.user_id} value={a.user_id} disabled={a.open_cases >= a.max_open_cases}>
                    {a.full_name} ({a.open_cases}/{a.max_open_cases})
                  </option>)}
                </select>
              </label>
            </div>
            <label className="field"><span>Note for the next agent</span>
              <input value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} maxLength={500} />
            </label>
            <div className="actions">
              <button className="btn btn-primary" disabled={busy}
                onClick={() => run("Case handed off.", () => api(`${url}/handoff`, "POST", { to_agent_id: agent ? Number(agent) : null, note: handoffNote }), () => setHandoffNote(""))}>
                Hand off
              </button>
            </div>
          </>
        )}

        {tab === "close" && (
          <>
            <label className="field"><span>Resolution</span>
              <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3}
                placeholder="Advice given, referral made, outcome. Future agents will see this when a similar call comes in." />
            </label>
            <label className="field"><span>Protocol followed</span>
              <select value={closeProtocol} onChange={(e) => setCloseProtocol(e.target.value)}>
                <option value="">None</option>
                {p.protocols.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
            <div className="actions">
              <button className="btn btn-primary" disabled={busy || resolution.trim().length < 10}
                onClick={() => run("Case closed.", () => api(`${url}/close`, "POST", { resolution, protocol_id: closeProtocol ? Number(closeProtocol) : null }))}>
                Close case
              </button>
              <span className="small muted">Closing also resolves open escalations and pending callbacks.</span>
            </div>
          </>
        )}

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {ok && <div className="alert alert-info" role="status">{ok}</div>}
      </div>
    </section>
  );
}

function PendingFollowUp({ f, busy, run }: {
  f: { id: number; at: string }; busy: boolean;
  run: (label: string, fn: () => Promise<unknown>, reset?: () => void) => Promise<void>;
}) {
  const [outcome, setOutcome] = useState("");
  return (
    <div className="actions" style={{ alignItems: "end" }}>
      <label className="field" style={{ flex: 1, minWidth: 220 }}>
        <span>Callback {fmtDateTime(f.at)}: outcome</span>
        <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="How is the patient now?" />
      </label>
      <button className="btn btn-sm" disabled={busy || outcome.trim().length < 3}
        onClick={() => run("Callback recorded.", () => api(`/api/follow-ups/${f.id}`, "PATCH", { outcome }))}>Mark done</button>
      <button className="btn btn-sm btn-danger" disabled={busy}
        onClick={() => run("Callback cancelled.", () => api(`/api/follow-ups/${f.id}`, "DELETE"))}>Cancel</button>
    </div>
  );
}
