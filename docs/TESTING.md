# Testing

## How to run

```bash
npm run db:reset                       # fresh schema + demo data
npm run dev                            # in another terminal
BASE_URL=http://localhost:3000 bash scripts/api-smoke-test.sh
```

The script signs in as an agent, a supervisor and an admin, drives the REST API, and checks the database directly with `psql` where a rule lives in the database. It needs `psql` on your PATH and `DATABASE_URL` in `.env`.

## Results

Run on PostgreSQL 16.x with pgvector 0.6, Next.js 15.5 production build: **30 passed, 0 failed.**

"Enforced by" says which layer stops the bad input. Several rules are checked in both the app (fast feedback) and the database (final guarantee).

| ID | Test case | Expected | Enforced by | Result |
|---|---|---|---|---|
| T01 | Sign in with a wrong password | 401, generic message | API + bcrypt | Pass |
| T02 | Call an API without a session | 401 | middleware | Pass |
| T03 | Register a call with an invalid phone | 400 | Zod + `caller_phone_check` | Pass |
| T04 | Register a valid call | 201 with case id | transaction | Pass |
| T05 | Record a red-flag symptom (seizure) on a low-severity case | severity becomes high | trigger `t_red_flag_severity` | Pass |
| T06 | Register a critical case | status escalated, escalation row created | triggers `t_case_lifecycle`, `t_case_auto_escalate` | Pass |
| T07 | Assigned agent adds a note | 201 | API | Pass |
| T08 | Agent escalates a case | 201 | API + transaction | Pass |
| T09 | Escalate the same case again while open | 409 | partial unique index `uq_escalation_one_active` | Pass |
| T10 | Agent tries to resolve an escalation | 403 | role check | Pass |
| T11 | Supervisor resolves the escalation | 200, case back in progress | API | Pass |
| T12 | Schedule a callback in the past | 400 | CHECK `chk_followup_future` | Pass |
| T13 | Schedule a valid callback | 201, status follow_up | API | Pass |
| T14 | Supervisor hands off the case | 200, note written | procedure `sp_handoff_case` | Pass |
| T15 | Previous agent edits the handed-off case | 403 | row lock + ownership check | Pass |
| T16 | Close with a too-short resolution | 400 | Zod + `chk_closed_has_resolution` | Pass |
| T17 | Close the case | 200 | procedure `sp_close_case` | Pass |
| T18 | Pending callbacks after close | 0 pending | procedure `sp_close_case` | Pass |
| T19 | Reopen a closed case | 400 | API + trigger `t_case_lifecycle` | Pass |
| T20 | Resolve an escalation on a still-critical case | 400 | API rule | Pass |
| T21 | Semantic and keyword search | both result sets returned | pgvector + full-text | Pass |
| T22 | Agent adds a protocol | 403 | role check | Pass |
| T23 | Supervisor adds a protocol | 201, embedding stored | API | Pass |
| T24 | Add a protocol with a duplicate code | 409 | UNIQUE `protocol_code_key` | Pass |
| T25 | Admin deletes a protocol | 200, linked cases keep history | FK ON DELETE SET NULL | Pass |
| T26 | Create a user whose email differs only in case | 409 | functional unique index on `lower(email)` | Pass |
| T27 | Admin demotes their own account | 400 | API rule | Pass |
| T28 | Insert a plaintext password directly in SQL | rejected | CHECK `app_user_password_hash_check` | Pass |
| T29 | Close a case directly in SQL without resolution | rejected | CHECK `chk_closed_has_resolution` | Pass |
| T30 | Audit rows carry the acting user | changed_by set | `app.user_id` + trigger `trg_audit` | Pass |

## Manual UI checks

- Signed-out visit to `/cases` redirects to `/login?next=/cases`.
- Agent visiting `/reports` or `/admin/users` is sent to the dashboard with a "needs a different role" notice.
- New call screen: matching protocols and similar resolved cases update about half a second after typing stops.
- Deactivating an agent reassigns their open cases (checked: 4 open cases before, 0 after) and ends their session on the next request.
- Light and dark colour schemes, and narrow mobile width, render without horizontal page scroll.
