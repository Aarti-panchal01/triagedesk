import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { listCases, PAGE_SIZE } from "@/lib/data";
import { CATEGORIES, SEVERITIES, STATUSES, STATUS_LABEL } from "@/lib/constants";
import { CaseList } from "@/components/CaseList";

export const metadata = { title: "Cases" };

type SP = { q?: string; status?: string; severity?: string; category?: string; mine?: string; page?: string };

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePageSession();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listCases({
    q: sp.q?.trim() || undefined,
    status: sp.status || undefined,
    severity: sp.severity || undefined,
    category: sp.category || undefined,
    assignedTo: sp.mine ? s.userId : undefined,
    page,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/cases?${new URLSearchParams({ ...sp, page: String(p) } as Record<string, string>)}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cases</h1>
          <p>Keyword search runs on Postgres full-text search. For meaning-based matches, use <Link href="/search">Search</Link>.</p>
        </div>
        <Link className="btn btn-primary" href="/cases/new">Log a new call</Link>
      </div>
      <section className="panel">
        <form className="filters" method="get">
          <input name="q" defaultValue={sp.q} placeholder="Search complaints and resolutions, e.g. fever rash child" aria-label="Search" />
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
            <option value="">Any status</option>
            <option value="active">All not closed</option>
            {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
          </select>
          <select name="severity" defaultValue={sp.severity ?? ""} aria-label="Severity">
            <option value="">Any severity</option>
            {SEVERITIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
            <option value="">Any category</option>
            {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <div className="actions">
            {sp.mine && <input type="hidden" name="mine" value="1" />}
            <button className="btn" type="submit">Apply</button>
            <Link className="btn btn-ghost" href="/cases">Reset</Link>
          </div>
        </form>
        <CaseList rows={rows} empty={sp.q ? "No case matches those words. Try Search for meaning-based matches." : "No cases match these filters."} />
        <div className="pager">
          <span>{total} case{total === 1 ? "" : "s"}{sp.mine ? ", assigned to you" : ""}</span>
          <span className="actions">
            {page > 1 && <Link className="btn btn-sm" href={link(page - 1)}>Previous</Link>}
            <span>Page {page} of {pages}</span>
            {page < pages && <Link className="btn btn-sm" href={link(page + 1)}>Next</Link>}
          </span>
        </div>
      </section>
    </>
  );
}
