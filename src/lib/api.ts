import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession, type Session } from "./auth";
import type { Role } from "./session-token";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireApiSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Sign in to continue.");
  if (roles && !roles.includes(s.role)) throw new HttpError(403, "Your role does not allow this action.");
  return s;
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id.");
  return id;
}

// Friendly messages for database constraints, so the DB stays the source of truth
// for validation and the user still gets a readable error.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  caller_phone_check: "Phone must be a 10-digit Indian mobile number starting with 6 to 9.",
  caller_phone_key: "A caller with this phone number already exists.",
  caller_age_check: "Age must be between 0 and 120.",
  caller_full_name_check: "Caller name must have at least 2 characters.",
  chk_alt_phone: "Alternate phone must be a valid mobile number different from the main one.",
  help_case_chief_complaint_check: "Describe the complaint in at least 10 characters.",
  chk_closed_has_resolution: "Closing a case needs resolution notes of at least 10 characters.",
  uq_escalation_one_active: "This case already has an open escalation.",
  uq_app_user_email: "A user with this email already exists.",
  app_user_email_check: "Enter a valid email address.",
  app_user_password_hash_check: "Password must be stored as a bcrypt hash.",
  app_user_max_open_cases_check: "Case capacity must be between 1 and 50.",
  protocol_code_key: "A protocol with this code already exists.",
  protocol_code_check: "Protocol code must look like FEV-01 (2 to 5 capital letters, a dash, 2 or 3 digits).",
  protocol_content_check: "Protocol content must be at least 50 characters.",
  case_note_body_check: "Note must have at least 3 characters.",
  escalation_reason_check: "Give a reason of at least 5 characters.",
  chk_followup_future: "Follow-up time must be in the future.",
  chk_followup_outcome: "Record an outcome to complete the follow-up.",
};

type PgError = { code?: string; constraint?: string; message: string; detail?: string };

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    const i = err.issues[0];
    return NextResponse.json({ error: `${i.path.join(".") || "input"}: ${i.message}` }, { status: 400 });
  }
  const pg = err as PgError;
  if (pg && typeof pg.code === "string") {
    const friendly = pg.constraint ? CONSTRAINT_MESSAGES[pg.constraint] : undefined;
    switch (pg.code) {
      case "23505": // unique_violation
        return NextResponse.json({ error: friendly ?? "That record already exists." }, { status: 409 });
      case "23514": // check_violation
      case "23502": // not_null_violation
      case "23503": // foreign_key_violation
      case "22P02": // invalid_text_representation (bad enum etc.)
      case "22001": // value too long
        return NextResponse.json(
          { error: friendly ?? `Rejected by database rule${pg.constraint ? ` (${pg.constraint})` : ""}.` },
          { status: 400 },
        );
      case "P0001": // RAISE EXCEPTION in our triggers / procedures
      case "P0002":
        return NextResponse.json({ error: pg.message }, { status: 400 });
    }
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong on the server. Check the server log." }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler so every thrown error becomes a clean JSON response */
export function handler<P = Record<string, string>>(
  fn: (req: Request, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
