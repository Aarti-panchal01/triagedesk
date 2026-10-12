import { STATUS_LABEL, type Severity, type Status } from "@/lib/constants";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge sev sev-${severity}`} style={{ textTransform: "capitalize" }}>{severity}</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge status status-${status}`}>{STATUS_LABEL[status]}</span>;
}
