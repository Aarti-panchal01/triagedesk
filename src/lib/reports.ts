/**
 * Supervisor reports. Each report keeps its SQL next to it so the UI can
 * show the exact query that produced the numbers.
 */
import "server-only";
import { query } from "./db";

export type Report = { key: string; title: string; description: string; sql: string; params?: unknown[] };

export const REPORTS: Report[] = [
  {
    key: "daily",
    title: "Calls per day, last 14 days",
    description: "generate_series fills in days with no calls so the chart has no gaps.",
    sql: `SELECT to_char(d.day, 'DD Mon') AS label,
       count(c.case_id)::int AS value,
       count(c.case_id) FILTER (WHERE c.severity >= 'high')::int AS urgent
  FROM generate_series(date_trunc('day', now()) - interval '13 days',
                       date_trunc('day', now()), interval '1 day') AS d(day)
  LEFT JOIN help_case c ON date_trunc('day', c.opened_at) = d.day
 GROUP BY d.day
 ORDER BY d.day`,
  },
  {
    key: "district",
    title: "Districts with 2 or more cases",
    description: "JOIN across three tables, GROUP BY with HAVING.",
    sql: `SELECT d.name AS label,
       count(*)::int AS value,
       count(*) FILTER (WHERE c.status <> 'closed')::int AS open
  FROM help_case c
  JOIN caller cl  ON cl.caller_id = c.caller_id
  JOIN district d ON d.district_id = cl.district_id
 GROUP BY d.name
HAVING count(*) >= 2
 ORDER BY value DESC`,
  },
  {
    key: "category",
    title: "Cases by category",
    description: "Reads from the v_category_stats view.",
    sql: `SELECT category AS label, total_cases::int AS value, open_cases::int AS open,
       high_or_critical::int AS urgent, avg_resolution_hours AS avg_hours
  FROM v_category_stats
 ORDER BY total_cases DESC`,
  },
  {
    key: "symptoms",
    title: "Most reported red-flag symptoms",
    description: "M:N join through case_symptom, filtered on the symptom flag.",
    sql: `SELECT s.name AS label, count(*)::int AS value
  FROM case_symptom cs
  JOIN symptom s ON s.symptom_id = cs.symptom_id
 WHERE s.is_red_flag
 GROUP BY s.name
 ORDER BY value DESC
 LIMIT 8`,
  },
  {
    key: "repeat",
    title: "Repeat callers",
    description: "Callers with more than one case, with their latest complaint (correlated subquery).",
    sql: `SELECT cl.full_name AS label, count(*)::int AS value,
       (SELECT c2.chief_complaint FROM help_case c2
         WHERE c2.caller_id = cl.caller_id
         ORDER BY c2.opened_at DESC LIMIT 1) AS latest
  FROM caller cl
  JOIN help_case c ON c.caller_id = cl.caller_id
 GROUP BY cl.caller_id, cl.full_name
HAVING count(*) > 1
 ORDER BY value DESC, label`,
  },
  {
    key: "stale",
    title: "Open cases older than the average resolution time",
    description: "Compares each open case with a scalar subquery over closed cases.",
    sql: `SELECT case_ref AS label, age_hours AS value, chief_complaint AS latest, assigned_name
  FROM v_case_overview
 WHERE status <> 'closed'
   AND age_hours > (SELECT avg(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600)
                      FROM help_case WHERE status = 'closed')
 ORDER BY age_hours DESC
 LIMIT 10`,
  },
];

export async function runReports() {
  const results = await Promise.all(REPORTS.map((r) => query<Record<string, unknown>>(r.sql, r.params ?? [])));
  return REPORTS.map((r, i) => ({ ...r, rows: results[i] }));
}
