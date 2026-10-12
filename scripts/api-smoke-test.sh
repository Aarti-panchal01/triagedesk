#!/usr/bin/env bash
# End-to-end API test. Prerequisites: npm run db:reset, app running (npm run dev).
# Usage: DATABASE_URL=... bash scripts/api-smoke-test.sh      (reads .env if present)
# Each line prints PASS/FAIL; the cases are documented in docs/TESTING.md.
set -u
[ -f .env ] && set -a && . ./.env && set +a
B=${BASE_URL:-http://localhost:3000}
pass=0; fail=0
q() { psql "$DATABASE_URL" -At -c "$1"; }
login() { curl -s -c "/tmp/td_$1.jar" -H 'Content-Type: application/json' -d "{\"email\":\"$2\",\"password\":\"Triage@123\"}" "$B/api/auth/login" >/dev/null; }
req() { # who method path [json]
  if [ $# -ge 4 ]; then curl -s -X "$2" -b "/tmp/td_$1.jar" -H 'Content-Type: application/json' -d "$4" "$B$3"
  else curl -s -X "$2" -b "/tmp/td_$1.jar" "$B$3"; fi
}
check() { # name expected-substring actual
  if [[ "$3" == *"$2"* ]]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 -> $3"; fail=$((fail+1)); fi
}

login ag agent1@triagedesk.in; login sup supervisor@triagedesk.in; login adm admin@triagedesk.in

check "T01 wrong password rejected" "incorrect" "$(curl -s -H 'Content-Type: application/json' -d '{"email":"agent1@triagedesk.in","password":"nope"}' $B/api/auth/login)"
check "T02 anonymous API call blocked" "Sign in" "$(curl -s $B/api/cases)"
check "T03 invalid phone rejected" "10-digit" "$(req ag POST /api/cases '{"caller":{"phone":"12345","full_name":"Test"},"chief_complaint":"Fever since two days","category":"Other","severity":"low"}')"

R=$(req ag POST /api/cases '{"caller":{"phone":"9000000001","full_name":"Smoke Caller","age":30,"preferred_language":"Kannada"},"chief_complaint":"Child has fever and had a seizure a few minutes ago","category":"Fever & Infection","severity":"low","symptom_ids":[1,4]}')
check "T04 case created" "case_id" "$R"; C1=$(echo "$R" | grep -o '[0-9]\+')
check "T05 red-flag trigger raised severity" "high" "$(q "select severity from help_case where case_id=$C1")"

R=$(req ag POST /api/cases '{"caller":{"phone":"9000000002","full_name":"Smoke Two"},"chief_complaint":"Crushing chest pain with sweating","category":"Cardiac","severity":"critical","symptom_ids":[9]}')
C2=$(echo "$R" | grep -o '[0-9]\+')
check "T06 critical case auto-escalated" "escalated|1" "$(q "select status, (select count(*) from escalation where case_id=$C2) from help_case where case_id=$C2")"

check "T07 note added" "ok" "$(req ag POST /api/cases/$C1/notes '{"note_type":"advice","body":"Go to hospital now"}')"
check "T08 manual escalation" "ok" "$(req ag POST /api/cases/$C1/escalate '{"reason":"Seizure in a child"}')"
check "T09 second open escalation blocked (partial unique index)" "already has an open escalation" "$(req ag POST /api/cases/$C1/escalate '{"reason":"Again please"}')"
check "T10 agent cannot resolve escalation" "role does not allow" "$(req ag PATCH /api/escalations/$(q "select escalation_id from escalation where case_id=$C1") '{"status":"resolved"}')"
check "T11 supervisor resolves escalation" "ok" "$(req sup PATCH /api/escalations/$(q "select escalation_id from escalation where case_id=$C1") '{"status":"resolved"}')"
check "T12 callback in the past rejected (CHECK)" "future" "$(req ag POST /api/cases/$C1/follow-ups "{\"scheduled_for\":\"2020-01-01T00:00:00Z\"}")"
check "T13 callback scheduled" "ok" "$(req ag POST /api/cases/$C1/follow-ups "{\"scheduled_for\":\"$(date -u -d '+2 hours' +%FT%TZ 2>/dev/null || date -u -v+2H +%FT%TZ)\"}")"
check "T14 handoff via stored procedure" "ok" "$(req sup POST /api/cases/$C1/handoff '{"note":"Shift change"}')"
check "T15 previous agent can no longer edit" "Only the assigned agent" "$(req ag PATCH /api/cases/$C1 '{"severity":"moderate"}')"
check "T16 short resolution rejected" "10 characters" "$(req sup POST /api/cases/$C1/close '{"resolution":"ok"}')"
check "T17 close via stored procedure" "ok" "$(req sup POST /api/cases/$C1/close '{"resolution":"Admitted, febrile seizure managed, discharged next day."}')"
check "T18 close settled pending callbacks" "0" "$(q "select count(*) from follow_up where case_id=$C1 and completed_at is null")"
check "T19 closed case cannot be reopened" "cannot be changed" "$(req sup PATCH /api/cases/$C1 '{"status":"open"}')"
check "T20 critical escalation cannot be resolved" "below critical" "$(req sup PATCH /api/escalations/$(q "select escalation_id from escalation where case_id=$C2") '{"status":"resolved"}')"
check "T21 semantic + keyword search" "semantic" "$(req ag POST /api/search '{"q":"child fits with fever"}')"
check "T22 agent cannot add protocol" "role does not allow" "$(req ag POST /api/protocols '{"code":"TST-01","title":"Test protocol","category":"Other","content":"Long enough protocol content for the fifty character database check."}')"
check "T23 supervisor adds protocol" "protocol_id" "$(req sup POST /api/protocols '{"code":"TST-01","title":"Test protocol","category":"Other","content":"Long enough protocol content for the fifty character database check."}')"
check "T24 duplicate code rejected (UNIQUE)" "already exists" "$(req sup POST /api/protocols '{"code":"TST-01","title":"Test protocol","category":"Other","content":"Long enough protocol content for the fifty character database check."}')"
check "T25 admin deletes protocol" "ok" "$(req adm DELETE /api/protocols/$(q "select protocol_id from protocol where code='TST-01'"))"
check "T26 duplicate email (case-insensitive index)" "already exists" "$(req adm POST /api/users '{"full_name":"Dup","email":"AGENT1@triagedesk.in","password":"password123","role":"agent"}')"
check "T27 admin cannot demote self" "cannot deactivate or demote" "$(req adm PATCH /api/users/1 '{"role":"agent"}')"
check "T28 DB rejects plaintext password" "password_hash_check" "$(q "insert into app_user(full_name,email,password_hash) values ('Plain Text','p@t.in','secret')" 2>&1)"
check "T29 DB rejects closing without resolution" "chk_closed_has_resolution" "$(q "update help_case set status='closed' where case_id=$C2" 2>&1)"
check "T30 audit log recorded acting user" "t" "$(q "select bool_and(changed_by is not null) from audit_log where table_name='help_case' and record_id=$C1")"

echo; echo "$pass passed, $fail failed"
[ $fail -eq 0 ]
