// Edge-safe (no Node APIs): used by middleware and server code alike.
import { SignJWT, jwtVerify } from "jose";

export type Role = "agent" | "supervisor" | "admin";
export const ROLES: Role[] = ["agent", "supervisor", "admin"];
export const SESSION_COOKIE = "td_session";
export const SESSION_HOURS = 8;

export type SessionClaims = { userId: number; name: string; email: string; role: Role };

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set and at least 32 characters long");
  return new TextEncoder().encode(s);
}

export async function signSession(c: SessionClaims): Promise<string> {
  return new SignJWT({ name: c.name, email: c.email, role: c.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(c.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role as Role;
    if (!ROLES.includes(role) || !payload.sub) return null;
    return { userId: Number(payload.sub), name: String(payload.name), email: String(payload.email), role };
  } catch {
    return null;
  }
}
