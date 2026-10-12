"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/components/client-api";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { CATEGORIES, type Severity, type Status } from "@/lib/constants";

type CaseHit = { case_id: number; case_ref: string; chief_complaint: string; resolution_notes: string | null; category: string; severity: Severity; status: Status; score: number };
type ProtocolHit = { protocol_id: number; code: string; title: string; category: string; excerpt: string; score: number };
type Result = { cases: CaseHit[]; protocols: ProtocolHit[] };

const EXAMPLES = [
  "my child has been very hot since yesterday and has red spots",
  "grandfather feels pressure in his chest and is sweating",
  "pregnant woman says baby is not kicking today",
  "farmer drank pesticide by mistake",
];

export function SearchClient() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [closedOnly, setClosedOnly] = useState(false);
  const [res, setRes] = useState<{ semantic: Result; keyword: Result; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(text = q) {
    if (text.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      setRes(await api("/api/search", "POST", { q: text, mode: "both", category: category || null, closedOnly }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <form className="panel-body stack" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <label className="field">
            <span>Describe the situation in plain words</span>
            <textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. old man cannot breathe properly at night" />
          </label>
          <div className="actions">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "auto" }} aria-label="Category">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={closedOnly} onChange={(e) => setClosedOnly(e.target.checked)} /> Resolved cases only</label>
            <button className="btn btn-primary" disabled={busy || q.trim().length < 3}>{busy ? "Searching..." : "Search"}</button>
            {res && <span className="small muted">{res.ms} ms</span>}
          </div>
          <div className="small muted">
            Try:{" "}
            {EXAMPLES.map((ex, i) => (
              <span key={ex}>
                <button type="button" className="btn-link" style={{ font: "inherit", background: "none", border: 0, padding: 0, color: "var(--brand)", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => { setQ(ex); search(ex); }}>{ex}</button>{i < EXAMPLES.length - 1 ? "; " : ""}
              </span>
            ))}
          </div>
        </form>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      {res && (
        <div className="grid-2">
          <Column title="By meaning" hint="cosine similarity, pgvector HNSW" r={res.semantic} percent />
          <Column title="By keywords" hint="ts_rank, GIN index" r={res.keyword} />
        </div>
      )}
    </div>
  );
}

function Column({ title, hint, r, percent }: { title: string; hint: string; r: Result; percent?: boolean }) {
  const score = (s: number) => (percent ? `${Math.round(s * 100)}%` : s.toFixed(3));
  return (
    <section className="panel">
      <div className="panel-head"><h2>{title}</h2><span className="hint">{hint}</span></div>
      <div className="panel-head"><h3>Protocols</h3></div>
      {r.protocols.length === 0 ? <div className="empty">No protocol matched.</div> : r.protocols.map((p) => (
        <div className="match" key={p.protocol_id}>
          <div className="match-top"><Link href={`/protocols/${p.protocol_id}`} className="what"><strong>{p.code}</strong>: {p.title}</Link><span className="score">{score(p.score)}</span></div>
        </div>
      ))}
      <div className="panel-head"><h3>Cases</h3><span className="hint">{r.cases.length}</span></div>
      {r.cases.length === 0 ? <div className="empty">{percent ? "Nothing similar enough." : "No case contains these words. Compare with the left column."}</div> : r.cases.map((c) => (
        <div className="match" key={c.case_id}>
          <div className="match-top">
            <span className="actions"><Link className="mono small" href={`/cases/${c.case_id}`}>{c.case_ref}</Link><SeverityBadge severity={c.severity} /><StatusBadge status={c.status} /></span>
            <span className="score">{score(c.score)}</span>
          </div>
          {percent && <div className="meter"><i style={{ width: `${Math.max(4, c.score * 100)}%` }} /></div>}
          <div className="what" style={{ marginTop: percent ? 0 : 6 }}>{c.chief_complaint}</div>
          {c.resolution_notes && <div className="resolution">{c.resolution_notes}</div>}
        </div>
      ))}
    </section>
  );
}
