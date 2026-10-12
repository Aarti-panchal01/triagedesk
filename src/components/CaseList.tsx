import Link from "next/link";
import type { CaseRow } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { SeverityBadge, StatusBadge } from "./badges";

type Row = Pick<CaseRow, "case_id" | "case_ref" | "chief_complaint" | "severity" | "status" | "category" |
  "caller_name" | "district" | "assigned_name" | "opened_at"> & { headline?: string | null };

export function CaseList({ rows, empty }: { rows: Row[]; empty: React.ReactNode }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <ul className="caselist">
      {rows.map((c) => (
        <li key={c.case_id}>
          <Link href={`/cases/${c.case_id}`} className={`caserow sev sev-${c.severity} ${c.status === "closed" ? "is-closed" : ""}`}>
            <span className="ref">{c.case_ref}</span>
            <div>
              {c.headline ? (
                // ts_headline output; it only ever contains <mark> tags we asked Postgres for
                <div className="complaint" dangerouslySetInnerHTML={{ __html: escapeExceptMark(c.headline) }} />
              ) : (
                <div className="complaint">{c.chief_complaint}</div>
              )}
              <div className="meta">
                {c.caller_name}{c.district ? `, ${c.district}` : ""} / {c.category} / {timeAgo(c.opened_at)}
                {c.assigned_name ? ` / with ${c.assigned_name}` : " / unassigned"}
              </div>
            </div>
            <div className="tags">
              <SeverityBadge severity={c.severity} />
              <StatusBadge status={c.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Escape everything, then restore only the <mark> tags */
function escapeExceptMark(s: string) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
}
