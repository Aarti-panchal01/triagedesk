"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/client-api";
import { CATEGORIES } from "@/lib/constants";

type Initial = { protocol_id?: number; code: string; title: string; category: string; content: string; is_active: boolean };

export function ProtocolForm({ initial, canDelete }: { initial?: Initial; canDelete?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Initial>(initial ?? { code: "", title: "", category: "Fever & Infection", content: "", is_active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!initial?.protocol_id;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const body = { code: f.code, title: f.title, category: f.category, content: f.content, is_active: f.is_active };
      if (editing) {
        await api(`/api/protocols/${initial!.protocol_id}`, "PUT", body);
        router.refresh();
        setBusy(false);
      } else {
        const r = await api<{ protocol_id: number }>("/api/protocols", "POST", body);
        router.push(`/protocols/${r.protocol_id}`);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this protocol permanently? Cases that used it keep their history but lose the link.")) return;
    setBusy(true);
    try {
      await api(`/api/protocols/${initial!.protocol_id}`, "DELETE");
      router.push("/protocols");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="panel panel-body stack" onSubmit={save}>
      <div className="row">
        <label className="field"><span>Code</span>
          <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="FEV-03" required />
          <small>2 to 5 capital letters, a dash, 2 or 3 digits</small>
        </label>
        <label className="field"><span>Category</span>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Title</span>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
      </label>
      <label className="field"><span>Guidance</span>
        <textarea rows={10} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} required />
        <small>Write it the way an agent would read it aloud. Saving re-computes the embedding.</small>
      </label>
      <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active (shown in suggestions)</label>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="actions">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Add protocol"}</button>
        {editing && canDelete && <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>Delete protocol</button>}
      </div>
    </form>
  );
}
