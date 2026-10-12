-- =====================================================================
-- TriageDesk : 99_important_queries.sql
-- Queries to run live during the demo/viva (psql or any SQL client).
-- Not applied by db:migrate.
-- =====================================================================

-- Q1. Case overview through the view (JOIN of 5 tables + subqueries)
SELECT case_ref, severity, status, caller_name, district, assigned_name, symptoms, age_hours
FROM v_case_overview
WHERE status <> 'closed'
ORDER BY severity DESC, opened_at;

-- Q2. Agent workload view (aggregates with FILTER)
SELECT * FROM v_agent_workload ORDER BY open_cases DESC;

-- Q3. Who would get the next case? (function with GROUP BY + HAVING)
SELECT fn_pick_agent() AS next_agent_id,
       (SELECT full_name FROM app_user WHERE user_id = fn_pick_agent()) AS next_agent;

-- Q4. Full-text search with ranking and highlighted snippet
SELECT case_id, ts_rank(search_tsv, q) AS rank,
       ts_headline('english', chief_complaint, q) AS snippet
FROM help_case, websearch_to_tsquery('english', 'chest pain sweating') q
WHERE search_tsv @@ q
ORDER BY rank DESC;

-- Q5. Vector similarity: 5 resolved cases closest to case 24
SELECT h.case_id, left(h.chief_complaint, 60) AS complaint,
       round((1 - (h.embedding <=> src.embedding))::numeric, 3) AS cosine_similarity
FROM help_case h
CROSS JOIN (SELECT embedding FROM help_case WHERE case_id = 24) src
WHERE h.case_id <> 24 AND h.status = 'closed'
ORDER BY h.embedding <=> src.embedding
LIMIT 5;

-- Q6. Does the planner use our indexes?
EXPLAIN SELECT * FROM help_case WHERE assigned_to = 4 AND status <> 'closed';   -- partial index
SET enable_seqscan = off;  -- demo table is tiny, so force the planner to show the GIN and HNSW indexes
EXPLAIN SELECT case_id FROM help_case WHERE search_tsv @@ to_tsquery('english', 'fever');  -- GIN
EXPLAIN SELECT case_id FROM help_case ORDER BY embedding <=> (SELECT embedding FROM help_case WHERE case_id = 1) LIMIT 5;
RESET enable_seqscan;

-- Q7. Repeat callers (GROUP BY + HAVING + correlated subquery)
SELECT cl.full_name, count(*) AS calls,
       (SELECT c2.chief_complaint FROM help_case c2 WHERE c2.caller_id = cl.caller_id
         ORDER BY c2.opened_at DESC LIMIT 1) AS latest_complaint
FROM caller cl JOIN help_case c ON c.caller_id = cl.caller_id
GROUP BY cl.caller_id, cl.full_name
HAVING count(*) > 1
ORDER BY calls DESC;

-- Q8. Open cases older than the average resolution time (scalar subquery)
SELECT case_ref, age_hours
FROM v_case_overview
WHERE status <> 'closed'
  AND age_hours > (SELECT avg(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600)
                     FROM help_case WHERE status = 'closed');

-- Q9. Trigger demo inside a transaction that we roll back (nothing is kept)
BEGIN;
  SELECT set_config('app.user_id', '4', true);
  INSERT INTO help_case (caller_id, created_by, assigned_to, chief_complaint, category, severity)
  VALUES (1, 4, 4, 'Demo: patient collapsed and is not responding', 'Cardiac', 'critical')
  RETURNING case_id, status;                            -- status comes back 'escalated'
  SELECT case_id, reason, status FROM escalation ORDER BY escalation_id DESC LIMIT 1;  -- auto row
  SELECT action, changed_by FROM audit_log ORDER BY log_id DESC LIMIT 2;               -- audited
ROLLBACK;

-- Q10. Constraint demos (each statement fails on purpose)
-- INSERT INTO app_user (full_name, email, password_hash) VALUES ('Plain Text', 'p@t.in', 'secret');
-- INSERT INTO caller (full_name, phone) VALUES ('Bad Phone', '12345');
-- UPDATE help_case SET status = 'closed' WHERE case_id = 21;           -- no resolution notes
-- UPDATE help_case SET status = 'open' WHERE case_id = 1;              -- closed cases cannot reopen (trigger)
-- CALL sp_handoff_case(21, 2, 4);                                       -- same agent / capacity checks

-- Q11. Daily volume with no gaps (generate_series + LEFT JOIN)
SELECT d::date AS day, count(c.case_id) AS calls
FROM generate_series(current_date - 6, current_date, interval '1 day') d
LEFT JOIN help_case c ON c.opened_at::date = d::date
GROUP BY d ORDER BY d;
