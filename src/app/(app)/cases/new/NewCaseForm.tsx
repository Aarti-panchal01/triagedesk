"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/components/client-api";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { CATEGORIES, LANGUAGES, SEVERITIES, type Severity, type Status } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

type Symptom = { symptom_id: number; name: string; body_system: string; is_red_flag: boolean };
type District = { district_id: number; name: string };
type CaseHit = { case_id: number; case_ref: string; chief_complaint: string; resolution_notes: string | null; category: string; severity: Severity; status: Status; score: number };
type ProtocolHit = { protocol_id: number; code: string; title: string; category: string; excerpt: string; score: number };
type PastCase = { case_id: number; case_ref: string; chief_complaint: string; status: Status; severity: Severity; opened_at: string };

export function NewCaseForm({ symptoms, districts }: { symptoms: Symptom[]; districts: District[] }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [caller, setCaller] = useState({ full_name: "", age: "", gender: "", district_id: "", preferred_language: "Kannada" });
  const [known, setKnown] = useState<{ found: boolean; cases: PastCase[] } | null>(null);
  const [complaint, setComplaint] = useState("");
  const [category, setCategory] = useState<string>("Fever & Infection");
  const [severity, setSeverity] = useState<Severity>("moderate");
  const [picked, setPicked] = useState<number[]>([]);
  const [protocolId, setProtocolId] = useState<number | null>(null);
  const [matches, setMatches] = useState<{ cases: CaseHit[]; protocols: ProtocolHit[] } | null>(null);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Look up the caller once a full number is typed
  useEffect(() => {
    if (!/^[6-9]\d{9}$/.test(phone)) { setKnown(null); return; }
    let live = true;
    api<{ caller: null | { full_name: string; age: number | null; gender: string | null; district_id: number | null; preferred_language: string }; cases: PastCase[] }>(
      `/api/callers?phone=${phone}`,
    ).then((r) => {
      if (!live) return;
      setKnown({ found: !!r.caller, cases: r.cases });
      if (r.caller) {
        setCaller({
          full_name: r.caller.full_name,
          age: r.caller.age?.toString() ?? "",
          gender: r.caller.gender ?? "",
          district_id: r.caller.district_id?.toString() ?? "",
          preferred_language: r.caller.preferred_language,
        });
      }
    }).catch(() => live && setKnown(null));
    return () => { live = false; };
  }, [phone]);

  // Debounced semantic search on the complaint
  useEffect(() => {
    const text = complaint.trim();
    if (text.length < 15) { setMatches(null); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setMatching(true);
      try {
        const r = await api<{ semantic: { cases: CaseHit[]; protocols: ProtocolHit[] } }>("/api/search", "POST", {
          q: `${category}. ${text}`, mode: "semantic", closedOnly: true,
        });
        if (mine === seq.current) setMatches(r.semantic);
      } catch {
        if (mine === seq.current) setMatches(null);
      } finally {
        if (mine === seq.current) setMatching(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [complaint, category]);

  const redFlagPicked = symptoms.some((s) => s.is_red_flag && picked.includes(s.symptom_id));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ case_id: number }>("/api/cases", "POST", {
        caller: {
          phone,
          full_name: caller.full_name,
          age: caller.age === "" ? null : Number(caller.age),
          gender: caller.gender || null,
          district_id: caller.district_id ? Number(caller.district_id) : null,
          preferred_language: caller.preferred_language,
        },
        chief_complaint: complaint,
        category,
        severity,
        symptom_ids: picked,
        applied_protocol_id: protocolId,
      });
      router.push(`/cases/${r.case_id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid-main">
      <div className="stack">
        <section className="panel">
          <div className="panel-head"><h2>Caller</h2>
            {known && <span className="hint">{known.found ? `Returning caller, ${known.cases.length} earlier case${known.cases.length === 1 ? "" : "s"}` : "New caller"}</span>}
          </div>
          <div className="panel-body stack">
            <div className="row">
              <label className="field">
                <span>Mobile number</span>
                <input inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="10 digits" required />
              </label>
              <label className="field">
                <span>Name</span>
                <input value={caller.full_name} onChange={(e) => setCaller({ ...caller, full_name: e.target.value })} required />
              </label>
            </div>
            <div className="row">
              <label className="field">
                <span>Age</span>
                <input type="number" min={0} max={120} value={caller.age} onChange={(e) => setCaller({ ...caller, age: e.target.value })} />
              </label>
              <label className="field">
                <span>Gender</span>
                <select value={caller.gender} onChange={(e) => setCaller({ ...caller, gender: e.target.value })}>
                  <option value="">Not given</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option>
                </select>
              </label>
              <label className="field">
                <span>District</span>
                <select value={caller.district_id} onChange={(e) => setCaller({ ...caller, district_id: e.target.value })}>
                  <option value="">Not given</option>
                  {districts.map((d) => <option key={d.district_id} value={d.district_id}>{d.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Language</span>
                <select value={caller.preferred_language} onChange={(e) => setCaller({ ...caller, preferred_language: e.target.value })}>
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </label>
            </div>
            {known?.cases.length ? (
              <div className="small">
                <div className="muted" style={{ marginBottom: 4 }}>Earlier calls from this number</div>
                {known.cases.map((c) => (
                  <div key={c.case_id} className="actions" style={{ marginBottom: 4 }}>
                    <Link className="mono" href={`/cases/${c.case_id}`} target="_blank">{c.case_ref}</Link>
                    <span>{fmtDate(c.opened_at)}</span>
                    <StatusBadge status={c.status} />
                    <span className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>{c.chief_complaint}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Complaint</h2></div>
          <div className="panel-body stack">
            <label className="field">
              <span>What is the caller reporting?</span>
              <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={4} required
                placeholder="In the caller's words: who is unwell, what they feel, since when." />
            </label>
            <div className="row">
              <label className="field">
                <span>Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <div className="field">
                <span>Severity</span>
                <div className="sev-picker" role="radiogroup" aria-label="Severity">
                  {SEVERITIES.map((s) => (
                    <label key={s} className={`sev sev-${s}`}>
                      <input type="radio" name="severity" value={s} checked={severity === s} onChange={() => setSeverity(s)} />
                      <span>{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <span>Symptoms</span>
              <div className="chips">
                {symptoms.map((s) => (
                  <label key={s.symptom_id} className={`chip ${s.is_red_flag ? "flag" : ""}`} title={s.is_red_flag ? "Red-flag symptom" : s.body_system}>
                    <input type="checkbox" checked={picked.includes(s.symptom_id)} onChange={() => toggle(s.symptom_id)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
              <small>Dashed outline marks red-flag symptoms. Picking one raises severity to at least high.</small>
            </div>
            {severity === "critical" && <div className="alert alert-error">Critical cases are escalated to a supervisor automatically when saved.</div>}
            {redFlagPicked && severity !== "critical" && severity !== "high" && (
              <div className="alert alert-info">A red-flag symptom is selected, so this case will be saved as high severity.</div>
            )}
          </div>
        </section>

        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="actions">
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Saving..." : "Save call"}</button>
          <Link className="btn btn-ghost" href="/cases">Cancel</Link>
          {protocolId && <span className="small muted">Protocol attached. It will be linked to the case.</span>}
        </div>
      </div>

      <aside className="stack">
        <section className="panel" aria-live="polite">
          <div className="panel-head"><h2>Matching protocols</h2>{matching && <span className="hint">Searching</span>}</div>
          {!matches ? (
            <div className="empty">Type at least a sentence of the complaint to see guidance.</div>
          ) : matches.protocols.length === 0 ? (
            <div className="empty">No protocol is close enough. Use clinical judgement and consider escalating.</div>
          ) : (
            matches.protocols.map((p) => (
              <div className="match" key={p.protocol_id}>
                <div className="match-top">
                  <strong className="what">{p.code}: {p.title}</strong>
                  <span className="score">{Math.round(p.score * 100)}%</span>
                </div>
                <div className="meter"><i style={{ width: `${Math.max(4, p.score * 100)}%` }} /></div>
                <div className="small muted">{p.excerpt}...</div>
                <div className="actions" style={{ marginTop: 8 }}>
                  <Link className="btn btn-sm" href={`/protocols/${p.protocol_id}`} target="_blank">Read</Link>
                  <button type="button" className={`btn btn-sm ${protocolId === p.protocol_id ? "btn-primary" : ""}`}
                    onClick={() => setProtocolId(protocolId === p.protocol_id ? null : p.protocol_id)}>
                    {protocolId === p.protocol_id ? "Attached" : "Attach to case"}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Similar resolved cases</h2></div>
          {!matches ? (
            <div className="empty">Closed cases with a similar complaint will show here, with how they were resolved.</div>
          ) : matches.cases.length === 0 ? (
            <div className="empty">No close match among resolved cases.</div>
          ) : (
            matches.cases.map((c) => (
              <div className="match" key={c.case_id}>
                <div className="match-top">
                  <Link className="mono small" href={`/cases/${c.case_id}`} target="_blank">{c.case_ref}</Link>
                  <span className="actions"><SeverityBadge severity={c.severity} /><span className="score">{Math.round(c.score * 100)}%</span></span>
                </div>
                <div className="meter"><i style={{ width: `${Math.max(4, c.score * 100)}%` }} /></div>
                <div className="what">{c.chief_complaint}</div>
                {c.resolution_notes && <div className="resolution">{c.resolution_notes}</div>}
              </div>
            ))
          )}
        </section>
      </aside>
    </form>
  );
}
