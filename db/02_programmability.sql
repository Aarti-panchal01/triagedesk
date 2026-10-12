-- =====================================================================
-- TriageDesk : 02_programmability.sql
-- Functions, stored procedures, triggers and views.
--
-- The app runs every write inside a transaction that first does:
--   SELECT set_config('app.user_id', '<id>', true);
-- so triggers know WHO made the change (see fn_current_app_user).
-- =====================================================================

-- ---------- helper: acting user for the current transaction ----------
CREATE OR REPLACE FUNCTION fn_current_app_user() RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::INT;
$$;

-- ---------- helper: least-loaded active agent with spare capacity ----------
-- Uses JOIN + GROUP BY + HAVING to respect each agent's max_open_cases.
CREATE OR REPLACE FUNCTION fn_pick_agent(p_exclude INT DEFAULT NULL) RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT u.user_id
  FROM app_user u
  LEFT JOIN help_case c ON c.assigned_to = u.user_id AND c.status <> 'closed'
  WHERE u.role = 'agent' AND u.is_active AND u.user_id IS DISTINCT FROM p_exclude
  GROUP BY u.user_id, u.max_open_cases
  HAVING count(c.case_id) < u.max_open_cases
  ORDER BY count(c.case_id), u.user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_pick_supervisor() RETURNS INT
LANGUAGE sql STABLE AS $$
  SELECT u.user_id
  FROM app_user u
  LEFT JOIN escalation e ON e.assigned_supervisor = u.user_id AND e.status <> 'resolved'
  WHERE u.role = 'supervisor' AND u.is_active
  GROUP BY u.user_id
  ORDER BY count(e.escalation_id), u.user_id
  LIMIT 1;
$$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- T1. keep updated_at fresh
CREATE OR REPLACE FUNCTION trg_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER t_case_touch BEFORE UPDATE ON help_case
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE TRIGGER t_protocol_touch BEFORE UPDATE ON protocol
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

-- T2. case lifecycle rules (BEFORE INSERT OR UPDATE)
--   * a closed case can never be reopened
--   * closing stamps closed_at automatically
--   * a critical case that is not closed is always in 'escalated' state
CREATE OR REPLACE FUNCTION trg_case_lifecycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'Case % is closed and cannot be reopened. Open a new case for the caller instead.', OLD.case_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;

  IF NEW.severity = 'critical' AND NEW.status IN ('open', 'in_progress', 'follow_up') THEN
    NEW.status := 'escalated';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER t_case_lifecycle BEFORE INSERT OR UPDATE ON help_case
  FOR EACH ROW EXECUTE FUNCTION trg_case_lifecycle();

-- T3. auto-create an escalation row for escalated cases (AFTER)
CREATE OR REPLACE FUNCTION trg_case_auto_escalate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'escalated'
     AND NOT EXISTS (SELECT 1 FROM escalation
                     WHERE case_id = NEW.case_id AND status <> 'resolved') THEN
    INSERT INTO escalation (case_id, raised_by, assigned_supervisor, reason)
    VALUES (NEW.case_id,
            coalesce(fn_current_app_user(), NEW.created_by),
            fn_pick_supervisor(),
            CASE WHEN NEW.severity = 'critical'
                 THEN 'Auto-escalated: case marked critical'
                 ELSE 'Auto-escalated: status set to escalated' END);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER t_case_auto_escalate AFTER INSERT OR UPDATE OF status, severity ON help_case
  FOR EACH ROW EXECUTE FUNCTION trg_case_auto_escalate();

-- T4. red-flag symptom bumps severity to at least 'high'
CREATE OR REPLACE FUNCTION trg_red_flag_severity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM symptom WHERE symptom_id = NEW.symptom_id AND is_red_flag) THEN
    UPDATE help_case
       SET severity = 'high'
     WHERE case_id = NEW.case_id
       AND severity < 'high'           -- enum ordering comparison
       AND status <> 'closed';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER t_red_flag_severity AFTER INSERT ON case_symptom
  FOR EACH ROW EXECUTE FUNCTION trg_red_flag_severity();

-- T5. generic audit trail (JSONB diff of the row)
CREATE OR REPLACE FUNCTION trg_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_id  BIGINT;
  v_pk  TEXT := TG_ARGV[0];   -- primary key column name passed by the trigger
BEGIN
  -- never copy secrets or bulky columns into the log
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - 'password_hash' - 'embedding' - 'search_tsv'; END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - 'password_hash' - 'embedding' - 'search_tsv'; END IF;

  -- skip no-op updates (e.g. only the embedding changed)
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
    RETURN NULL;
  END IF;

  v_id := coalesce(v_new, v_old) ->> v_pk;
  INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  VALUES (TG_TABLE_NAME, v_id, left(TG_OP, 1), fn_current_app_user(), v_old, v_new);
  RETURN NULL;
END $$;

CREATE TRIGGER t_audit_case AFTER INSERT OR UPDATE OR DELETE ON help_case
  FOR EACH ROW EXECUTE FUNCTION trg_audit('case_id');
CREATE TRIGGER t_audit_escalation AFTER INSERT OR UPDATE OR DELETE ON escalation
  FOR EACH ROW EXECUTE FUNCTION trg_audit('escalation_id');
CREATE TRIGGER t_audit_user AFTER INSERT OR UPDATE OR DELETE ON app_user
  FOR EACH ROW EXECUTE FUNCTION trg_audit('user_id');
CREATE TRIGGER t_audit_protocol AFTER INSERT OR UPDATE OR DELETE ON protocol
  FOR EACH ROW EXECUTE FUNCTION trg_audit('protocol_id');

-- =====================================================================
-- STORED PROCEDURES (called with CALL inside the app's transaction)
-- =====================================================================

-- P1. close a case: lock row, validate, close, settle escalations & follow-ups
CREATE OR REPLACE PROCEDURE sp_close_case(p_case_id BIGINT, p_actor INT, p_resolution TEXT,
                                          p_protocol_id INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  v_status case_status;
BEGIN
  SELECT status INTO v_status FROM help_case WHERE case_id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case % does not exist', p_case_id USING ERRCODE = 'P0002';
  END IF;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Case % is already closed', p_case_id;
  END IF;

  UPDATE help_case
     SET status = 'closed',
         resolution_notes = p_resolution,
         applied_protocol_id = coalesce(p_protocol_id, applied_protocol_id)
   WHERE case_id = p_case_id;

  UPDATE escalation SET status = 'resolved', resolved_at = now()
   WHERE case_id = p_case_id AND status <> 'resolved';

  UPDATE follow_up SET completed_at = now(), outcome = 'Settled when case was closed'
   WHERE case_id = p_case_id AND completed_at IS NULL;

  INSERT INTO case_note (case_id, author_id, note_type, body)
  VALUES (p_case_id, p_actor, 'system', 'Case closed. ' || p_resolution);
END $$;

-- P2. hand a case to another agent (or auto-pick the least loaded one)
CREATE OR REPLACE PROCEDURE sp_handoff_case(p_case_id BIGINT, p_actor INT,
                                            p_to_agent INT DEFAULT NULL, p_note TEXT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  v_from   INT;
  v_target INT;
  v_load   INT;
  v_cap    INT;
BEGIN
  SELECT assigned_to INTO v_from FROM help_case
   WHERE case_id = p_case_id AND status <> 'closed' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case % does not exist or is closed', p_case_id;
  END IF;

  v_target := coalesce(p_to_agent, fn_pick_agent(v_from));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No agent has spare capacity right now';
  END IF;
  IF v_target = v_from THEN
    RAISE EXCEPTION 'Case is already assigned to this agent';
  END IF;

  SELECT u.max_open_cases, count(c.case_id) INTO v_cap, v_load
    FROM app_user u
    LEFT JOIN help_case c ON c.assigned_to = u.user_id AND c.status <> 'closed'
   WHERE u.user_id = v_target AND u.role = 'agent' AND u.is_active
   GROUP BY u.max_open_cases;
  IF v_cap IS NULL THEN
    RAISE EXCEPTION 'User % is not an active agent', v_target;
  END IF;
  IF v_load >= v_cap THEN
    RAISE EXCEPTION 'Agent % is at capacity (% of % cases)', v_target, v_load, v_cap;
  END IF;

  UPDATE help_case SET assigned_to = v_target WHERE case_id = p_case_id;

  INSERT INTO case_note (case_id, author_id, note_type, body)
  VALUES (p_case_id, p_actor, 'handoff',
          format('Handed off from %s to %s. %s',
                 coalesce((SELECT full_name FROM app_user WHERE user_id = v_from), 'unassigned'),
                 (SELECT full_name FROM app_user WHERE user_id = v_target),
                 coalesce(p_note, '')));
END $$;

-- =====================================================================
-- VIEWS
-- =====================================================================

-- V1. one row per case with everything a list/detail screen needs
CREATE OR REPLACE VIEW v_case_overview AS
SELECT c.case_id,
       'TD-' || lpad(c.case_id::TEXT, 6, '0')              AS case_ref,
       c.chief_complaint, c.category, c.severity, c.status,
       c.resolution_notes, c.opened_at, c.updated_at, c.closed_at,
       c.caller_id, cl.full_name AS caller_name, cl.phone AS caller_phone,
       cl.age AS caller_age, cl.gender AS caller_gender,
       cl.preferred_language, d.name AS district,
       c.assigned_to, ag.full_name AS assigned_name,
       c.created_by,  cr.full_name AS created_by_name,
       c.applied_protocol_id, p.code AS applied_protocol_code,
       (SELECT string_agg(s.name, ', ' ORDER BY s.name)
          FROM case_symptom cs JOIN symptom s USING (symptom_id)
         WHERE cs.case_id = c.case_id)                        AS symptoms,
       EXISTS (SELECT 1 FROM escalation e
                WHERE e.case_id = c.case_id AND e.status <> 'resolved') AS has_active_escalation,
       round(EXTRACT(EPOCH FROM (coalesce(c.closed_at, now()) - c.opened_at)) / 3600, 1) AS age_hours
FROM help_case c
JOIN caller cl        ON cl.caller_id = c.caller_id
LEFT JOIN district d  ON d.district_id = cl.district_id
LEFT JOIN app_user ag ON ag.user_id = c.assigned_to
JOIN app_user cr      ON cr.user_id = c.created_by
LEFT JOIN protocol p  ON p.protocol_id = c.applied_protocol_id;

-- V2. per-agent workload (supervisor dashboard)
CREATE OR REPLACE VIEW v_agent_workload AS
SELECT u.user_id, u.full_name, u.is_active, u.max_open_cases,
       count(c.case_id) FILTER (WHERE c.status <> 'closed')                     AS open_cases,
       count(c.case_id) FILTER (WHERE c.status <> 'closed' AND c.severity >= 'high') AS urgent_open,
       count(c.case_id) FILTER (WHERE c.closed_at > now() - interval '30 days') AS closed_30d,
       round(avg(EXTRACT(EPOCH FROM (c.closed_at - c.opened_at)) / 3600)
             FILTER (WHERE c.closed_at > now() - interval '30 days'), 1)        AS avg_resolution_hours_30d
FROM app_user u
LEFT JOIN help_case c ON c.assigned_to = u.user_id
WHERE u.role = 'agent'
GROUP BY u.user_id, u.full_name, u.is_active, u.max_open_cases;

-- V3. per-category statistics
CREATE OR REPLACE VIEW v_category_stats AS
SELECT category,
       count(*)                                                    AS total_cases,
       count(*) FILTER (WHERE status <> 'closed')                  AS open_cases,
       count(*) FILTER (WHERE severity >= 'high')                  AS high_or_critical,
       round(avg(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600)
             FILTER (WHERE status = 'closed'), 1)                  AS avg_resolution_hours
FROM help_case
GROUP BY category;
