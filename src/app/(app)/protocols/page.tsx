import Link from "next/link";
import { requirePageSession, isLead } from "@/lib/auth";
import { listProtocols } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Protocols" };

export default async function ProtocolsPage() {
  const s = await requirePageSession();
  const protocols = await listProtocols();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Protocols</h1>
          <p>Standard advice scripts. Each one is embedded when saved, so new calls can find it by meaning.</p>
        </div>
        {isLead(s) && <Link className="btn btn-primary" href="/protocols/new">Add protocol</Link>}
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Title</th><th>Category</th><th className="num">Used on cases</th><th>Updated</th><th>State</th></tr></thead>
            <tbody>
              {protocols.map((p) => (
                <tr key={p.protocol_id} style={{ opacity: p.is_active ? 1 : 0.6 }}>
                  <td className="mono">{p.code}</td>
                  <td><Link href={`/protocols/${p.protocol_id}`}>{p.title}</Link></td>
                  <td>{p.category}</td>
                  <td className="num">{p.times_applied}</td>
                  <td>{fmtDate(p.updated_at)}</td>
                  <td>{p.is_active ? "Active" : "Retired"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
