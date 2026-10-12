/**
 * Read-side data access used by server components.
 * Every query is plain SQL so it can be shown and explained in the viva.
 */
import "server-only";
import { query, queryOne } from "./db";
import type { Severity, Status } from "./constants";

export type CaseRow = {
  case_id: number; case_ref: string; chief_complaint: string; category: string;
  severity: Severity; status: Status; resolution_notes: string | null;
  opened_at: Date; updated_at: Date; closed_at: Date | null;
  caller_id: number; caller_name: string; caller_phone: string; caller_age: number | null;
  caller_gender: string | null; preferred_language: string; district: string | null;
  assigned_to: number | null; assigned_name: string | null;
  created_by: number; created_by_name: string;
  applied_protocol_id: number | null; applied_protocol_code: string | null;
  symptoms: string | null; has_active_escalation: boolean; age_hours: number;
};

export type CaseFilters = {
  q?: string; status?: string; severity?: string; category?: string;
  assignedTo?: number; page?: number;
};

export const PAGE_SIZE = 20;

export async function listCases(f: CaseFilters) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };

  let rankSelect = "0::real AS rank";
  let headline = "NULL::text AS headline";
  if (f.q) {
    params.push(f.q);
    const p = `$${params.length}`;
    where.push(`h.search_tsv @@ websearch_to_tsquery('english', ${p})`);
    rankSelect = `ts_rank(h.search_tsv, websearch_to_tsquery('english', ${p})) AS rank`;
    headline = `ts_headline('english', v.chief_complaint, websearch_to_tsquery('english', ${p}),
                 'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=12') AS headline`;
  }
  if (f.status === "active") where.push("v.status <> 'closed'");
  else if (f.status) add("v.status = ?::case_status", f.status);
  if (f.severity) add("v.severity = ?::case_severity", f.severity);
  if (f.category) add("v.category = ?", f.category);
  if (f.assignedTo) add("v.assigned_to = ?", f.assignedTo);

  const page = Math.max(1, f.page ?? 1);
  params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);

  const rows = await query<CaseRow & { rank: number; headline: string | null; total: number }>(
    `SELECT v.*, ${rankSelect}, ${headline}, count(*) OVER () AS total
       FROM v_case_overview v
       JOIN help_case h ON h.case_id = v.case_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY ${f.q ? "rank DESC," : ""}
               (v.status = 'closed'), v.severity DESC, v.opened_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: rows[0]?.total ?? 0, page };
}

export const getCase = (id: number) =>
  queryOne<CaseRow>("SELECT * FROM v_case_overview WHERE case_id = $1", [id]);

export const getCaseSymptomIds = (id: number) =>
  query<{ symptom_id: number; name: string; is_red_flag: boolean }>(
    `SELECT s.symptom_id, s.name, s.is_red_flag
       FROM case_symptom cs JOIN symptom s ON s.symptom_id = cs.symptom_id
      WHERE cs.case_id = $1 ORDER BY s.is_red_flag DESC, s.name`,
    [id],
  );

export const getCaseNotes = (id: number) =>
  query<{ note_id: number; note_type: string; body: string; created_at: Date; author_name: string }>(
    `SELECT n.note_id, n.note_type, n.body, n.created_at, u.full_name AS author_name
       FROM case_note n JOIN app_user u ON u.user_id = n.author_id
      WHERE n.case_id = $1 ORDER BY n.created_at`,
    [id],
  );

export const getCaseEscalations = (id: number) =>
  query<{ escalation_id: number; reason: string; status: string; created_at: Date;
          resolved_at: Date | null; raised_by_name: string; supervisor_name: string | null }>(
    `SELECT e.escalation_id, e.reason, e.status, e.created_at, e.resolved_at,
            r.full_name AS raised_by_name, s.full_name AS supervisor_name
       FROM escalation e
       JOIN app_user r ON r.user_id = e.raised_by
       LEFT JOIN app_user s ON s.user_id = e.assigned_supervisor
      WHERE e.case_id = $1 ORDER BY e.created_at DESC`,
    [id],
  );

export const getCaseFollowUps = (id: number) =>
  query<{ follow_up_id: number; scheduled_for: Date; completed_at: Date | null; outcome: string | null; created_by_name: string }>(
    `SELECT f.follow_up_id, f.scheduled_for, f.completed_at, f.outcome, u.full_name AS created_by_name
       FROM follow_up f JOIN app_user u ON u.user_id = f.created_by
      WHERE f.case_id = $1 ORDER BY f.scheduled_for`,
    [id],
  );

export const getCaseAudit = (id: number) =>
  query<{ log_id: number; table_name: string; action: string; changed_at: Date; changed_by_name: string | null;
          old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }>(
    `SELECT a.log_id, a.table_name, a.action, a.changed_at, u.full_name AS changed_by_name, a.old_data, a.new_data
       FROM audit_log a LEFT JOIN app_user u ON u.user_id = a.changed_by
      WHERE (a.table_name = 'help_case' AND a.record_id = $1)
         OR (a.table_name = 'escalation' AND (coalesce(a.new_data, a.old_data) ->> 'case_id')::bigint = $1)
      ORDER BY a.changed_at DESC LIMIT 40`,
    [id],
  );

export const getCallerHistory = (callerId: number, excludeCase: number) =>
  query<{ case_id: number; case_ref: string; chief_complaint: string; status: Status; severity: Severity; opened_at: Date }>(
    `SELECT case_id, case_ref, chief_complaint, status, severity, opened_at
       FROM v_case_overview WHERE caller_id = $1 AND case_id <> $2
      ORDER BY opened_at DESC LIMIT 10`,
    [callerId, excludeCase],
  );

export type SimilarCase = {
  case_id: number; case_ref: string; chief_complaint: string; resolution_notes: string | null;
  category: string; severity: Severity; status: Status; similarity: number;
};

/** Nearest closed cases to a stored case, by cosine similarity of their embeddings */
export const getSimilarToCase = (id: number, limit = 5) =>
  query<SimilarCase>(
    `SELECT v.case_id, v.case_ref, v.chief_complaint, v.resolution_notes, v.category, v.severity, v.status,
            round((1 - (h.embedding <=> src.embedding))::numeric, 3) AS similarity
       FROM help_case h
       JOIN v_case_overview v ON v.case_id = h.case_id
      CROSS JOIN (SELECT embedding FROM help_case WHERE case_id = $1) src
      WHERE h.case_id <> $1 AND h.status = 'closed'
        AND h.embedding IS NOT NULL AND src.embedding IS NOT NULL
      ORDER BY h.embedding <=> src.embedding
      LIMIT $2`,
    [id, limit],
  );

export const listSymptoms = () =>
  query<{ symptom_id: number; name: string; body_system: string; is_red_flag: boolean }>(
    "SELECT symptom_id, name, body_system, is_red_flag FROM symptom ORDER BY body_system, name",
  );

export const listDistricts = () =>
  query<{ district_id: number; name: string }>("SELECT district_id, name FROM district ORDER BY name");

export const listActiveAgents = () =>
  query<{ user_id: number; full_name: string; open_cases: number; max_open_cases: number }>(
    `SELECT user_id, full_name, open_cases, max_open_cases
       FROM v_agent_workload WHERE is_active ORDER BY open_cases, full_name`,
  );

export type ProtocolRow = {
  protocol_id: number; code: string; title: string; category: string; content: string;
  is_active: boolean; updated_at: Date; created_by_name: string | null; times_applied: number;
};

export const listProtocols = () =>
  query<ProtocolRow>(
    `SELECT p.protocol_id, p.code, p.title, p.category, p.content, p.is_active, p.updated_at,
            u.full_name AS created_by_name,
            (SELECT count(*) FROM help_case c WHERE c.applied_protocol_id = p.protocol_id)::int AS times_applied
       FROM protocol p LEFT JOIN app_user u ON u.user_id = p.created_by
      ORDER BY p.is_active DESC, p.category, p.code`,
  );

export const getProtocol = (id: number) =>
  queryOne<ProtocolRow>(
    `SELECT p.*, u.full_name AS created_by_name,
            (SELECT count(*) FROM help_case c WHERE c.applied_protocol_id = p.protocol_id)::int AS times_applied
       FROM protocol p LEFT JOIN app_user u ON u.user_id = p.created_by WHERE p.protocol_id = $1`,
    [id],
  );

export const listUsers = () =>
  query<{ user_id: number; full_name: string; email: string; role: string; is_active: boolean;
          max_open_cases: number; last_login_at: Date | null; open_cases: number }>(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.max_open_cases, u.last_login_at,
            count(c.case_id) FILTER (WHERE c.status <> 'closed')::int AS open_cases
       FROM app_user u LEFT JOIN help_case c ON c.assigned_to = u.user_id
      GROUP BY u.user_id ORDER BY u.role, u.full_name`,
  );

export async function getDashboard(userId: number, lead: boolean) {
  const [counts, mine, escalations, followUps, recent] = await Promise.all([
    queryOne<{ active: number; critical: number; escalated: number; opened_today: number; closed_today: number }>(
      `SELECT count(*) FILTER (WHERE status <> 'closed')                                 AS active,
              count(*) FILTER (WHERE status <> 'closed' AND severity = 'critical')       AS critical,
              count(*) FILTER (WHERE status = 'escalated')                               AS escalated,
              count(*) FILTER (WHERE opened_at >= date_trunc('day', now()))              AS opened_today,
              count(*) FILTER (WHERE closed_at >= date_trunc('day', now()))              AS closed_today
         FROM help_case`,
    ),
    query<CaseRow>(
      `SELECT * FROM v_case_overview
        WHERE assigned_to = $1 AND status <> 'closed'
        ORDER BY severity DESC, opened_at LIMIT 8`,
      [userId],
    ),
    query<{ escalation_id: number; case_id: number; case_ref: string; reason: string; status: string;
            created_at: Date; chief_complaint: string; severity: Severity; supervisor_name: string | null }>(
      `SELECT e.escalation_id, e.case_id, v.case_ref, e.reason, e.status, e.created_at,
              v.chief_complaint, v.severity, s.full_name AS supervisor_name
         FROM escalation e
         JOIN v_case_overview v ON v.case_id = e.case_id
         LEFT JOIN app_user s ON s.user_id = e.assigned_supervisor
        WHERE e.status <> 'resolved' ${lead ? "" : "AND v.assigned_to = $1"}
        ORDER BY v.severity DESC, e.created_at LIMIT 8`,
      lead ? [] : [userId],
    ),
    query<{ follow_up_id: number; case_id: number; case_ref: string; caller_name: string;
            caller_phone: string; scheduled_for: Date }>(
      `SELECT f.follow_up_id, f.case_id, v.case_ref, v.caller_name, v.caller_phone, f.scheduled_for
         FROM follow_up f JOIN v_case_overview v ON v.case_id = f.case_id
        WHERE f.completed_at IS NULL AND f.scheduled_for < now() + interval '1 day'
          ${lead ? "" : "AND v.assigned_to = $1"}
        ORDER BY f.scheduled_for LIMIT 8`,
      lead ? [] : [userId],
    ),
    query<CaseRow>("SELECT * FROM v_case_overview ORDER BY opened_at DESC LIMIT 6"),
  ]);
  const workload = lead
    ? await query<{ user_id: number; full_name: string; open_cases: number; urgent_open: number;
                    max_open_cases: number; closed_30d: number; avg_resolution_hours_30d: number | null }>(
        "SELECT * FROM v_agent_workload WHERE is_active ORDER BY open_cases DESC, full_name",
      )
    : [];
  return { counts: counts!, mine, escalations, followUps, recent, workload };
}
