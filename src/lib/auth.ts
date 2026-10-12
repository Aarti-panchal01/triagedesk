import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { queryOne } from "./db";
import { SESSION_COOKIE, verifySession, type Role } from "./session-token";

export type Session = { userId: number; name: string; email: string; role: Role };

/**
 * Reads the signed cookie, then re-checks the user row so that a deactivated
 * user or a changed role takes effect immediately, not after the token expires.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const row = await queryOne<{ full_name: string; email: string; role: Role; is_active: boolean }>(
    "SELECT full_name, email, role, is_active FROM app_user WHERE user_id = $1",
    [claims.userId],
  );
  if (!row || !row.is_active) return null;
  return { userId: claims.userId, name: row.full_name, email: row.email, role: row.role };
}

/** For pages: redirect instead of throwing */
export async function requirePageSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.role)) redirect("/dashboard?denied=1");
  return s;
}

export const isLead = (s: Session) => s.role === "supervisor" || s.role === "admin";
