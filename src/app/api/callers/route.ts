import { NextResponse } from "next/server";
import { handler, requireApiSession } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { phoneSchema } from "@/lib/validation";

// GET /api/callers?phone=9876543210  -> caller profile + their recent cases
export const GET = handler(async (req) => {
  await requireApiSession();
  const phone = phoneSchema.parse(new URL(req.url).searchParams.get("phone") ?? "");
  const caller = await queryOne(
    `SELECT caller_id, full_name, phone, age, gender, district_id, preferred_language
       FROM caller WHERE phone = $1`,
    [phone],
  );
  if (!caller) return NextResponse.json({ caller: null, cases: [] });
  const cases = await query(
    `SELECT case_id, case_ref, chief_complaint, status, severity, opened_at
       FROM v_case_overview WHERE caller_id = $1 ORDER BY opened_at DESC LIMIT 5`,
    [caller.caller_id],
  );
  return NextResponse.json({ caller, cases });
});
