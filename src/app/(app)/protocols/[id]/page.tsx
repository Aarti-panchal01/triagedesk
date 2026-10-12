import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession, isLead } from "@/lib/auth";
import { getProtocol } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { ProtocolForm } from "../ProtocolForm";

export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePageSession();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const p = await getProtocol(id);
  if (!p) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <p className="mono"><Link href="/protocols">Protocols</Link> / {p.code}</p>
          <h1 style={{ marginTop: 6 }}>{p.title}</h1>
          <p>{p.category} / used on {p.times_applied} case{p.times_applied === 1 ? "" : "s"} / updated {fmtDate(p.updated_at)}{p.is_active ? "" : " / retired"}</p>
        </div>
      </div>
      <div className="grid-main">
        <section className="panel panel-body">
          <div style={{ whiteSpace: "pre-wrap", maxWidth: "72ch", lineHeight: 1.65 }}>{p.content}</div>
        </section>
        {isLead(s) && (
          <div className="stack">
            <h2>Edit</h2>
            <ProtocolForm
              initial={{ protocol_id: p.protocol_id, code: p.code, title: p.title, category: p.category, content: p.content, is_active: p.is_active }}
              canDelete={s.role === "admin"}
            />
          </div>
        )}
      </div>
    </>
  );
}
