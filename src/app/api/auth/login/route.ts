import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handler, HttpError } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { SESSION_COOKIE, SESSION_HOURS, signSession, type Role } from "@/lib/session-token";
import { loginSchema } from "@/lib/validation";

// Used when the email does not exist, so both paths take the same time
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-password", 10);

export const POST = handler(async (req) => {
  const { email, password } = loginSchema.parse(await req.json());
  const user = await queryOne<{ user_id: number; full_name: string; email: string; role: Role;
                                password_hash: string; is_active: boolean }>(
    "SELECT user_id, full_name, email, role, password_hash, is_active FROM app_user WHERE lower(email) = lower($1)",
    [email],
  );
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.");
  if (!user.is_active) throw new HttpError(403, "This account is deactivated. Ask an admin to reactivate it.");

  await query("UPDATE app_user SET last_login_at = now() WHERE user_id = $1", [user.user_id]);
  const token = await signSession({ userId: user.user_id, name: user.full_name, email: user.email, role: user.role });

  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return res;
});
