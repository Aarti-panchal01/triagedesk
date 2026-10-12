import { z } from "zod";
import { CATEGORIES, LANGUAGES, NOTE_TYPES, SEVERITIES } from "./constants";

// App-level validation gives instant feedback; the database constraints are the
// final guard and would reject the same bad data on their own.
const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} needs at least ${min} characters`).max(max, `${label} is too long`);

export const phoneSchema = z.string().trim().regex(/^[6-9]\d{9}$/, "must be a 10-digit Indian mobile number");

export const callerSchema = z.object({
  phone: phoneSchema,
  full_name: trimmed(2, 100, "Name"),
  age: z.coerce.number().int().min(0).max(120).nullable().optional(),
  gender: z.enum(["M", "F", "O"]).nullable().optional(),
  district_id: z.coerce.number().int().positive().nullable().optional(),
  preferred_language: z.enum(LANGUAGES).default("Kannada"),
});

export const createCaseSchema = z.object({
  caller: callerSchema,
  chief_complaint: trimmed(10, 2000, "Complaint"),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  symptom_ids: z.array(z.number().int().positive()).max(15).default([]),
  applied_protocol_id: z.number().int().positive().nullable().optional(),
});

export const updateCaseSchema = z
  .object({
    status: z.enum(["open", "in_progress", "follow_up"]).optional(),
    severity: z.enum(SEVERITIES).optional(),
    applied_protocol_id: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const noteSchema = z.object({ note_type: z.enum(NOTE_TYPES), body: trimmed(3, 4000, "Note") });
export const escalateSchema = z.object({ reason: trimmed(5, 1000, "Reason") });
export const closeSchema = z.object({
  resolution: trimmed(10, 4000, "Resolution"),
  protocol_id: z.number().int().positive().nullable().optional(),
});
export const handoffSchema = z.object({
  to_agent_id: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});
export const followUpSchema = z.object({ scheduled_for: z.coerce.date() });
export const completeFollowUpSchema = z.object({ outcome: trimmed(3, 1000, "Outcome") });
export const escalationUpdateSchema = z.object({ status: z.enum(["acknowledged", "resolved"]) });

export const searchSchema = z.object({
  q: trimmed(3, 500, "Search text"),
  mode: z.enum(["semantic", "keyword", "both"]).default("both"),
  category: z.enum(CATEGORIES).nullable().optional(),
  closedOnly: z.boolean().default(false),
});

export const protocolSchema = z.object({
  code: z.string().trim().regex(/^[A-Z]{2,5}-\d{2,3}$/, "use a code like FEV-01"),
  title: trimmed(5, 150, "Title"),
  category: z.enum(CATEGORIES),
  content: trimmed(50, 8000, "Content"),
  is_active: z.boolean().default(true),
});

export const createUserSchema = z.object({
  full_name: trimmed(2, 100, "Name"),
  email: z.string().trim().email("must be a valid email").max(150),
  password: z.string().min(8, "Password needs at least 8 characters").max(72),
  role: z.enum(["agent", "supervisor", "admin"]),
  max_open_cases: z.coerce.number().int().min(1).max(50).default(15),
});

export const updateUserSchema = z
  .object({
    role: z.enum(["agent", "supervisor", "admin"]).optional(),
    is_active: z.boolean().optional(),
    max_open_cases: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const loginSchema = z.object({
  email: z.string().trim().email("must be a valid email"),
  password: z.string().min(1, "is required"),
});
