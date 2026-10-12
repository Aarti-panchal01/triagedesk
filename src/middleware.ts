import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

// First line of defence: no valid token, no app pages. Route handlers and
// pages still check the role themselves against the database.
const LEAD_ONLY = ["/reports"];
const ADMIN_ONLY = ["/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (!session && !pathname.startsWith("/api/auth/")) {
      return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }
  if (!session) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  const denied = new URL("/dashboard?denied=1", req.url);
  if (ADMIN_ONLY.some((p) => pathname.startsWith(p)) && session.role !== "admin") return NextResponse.redirect(denied);
  if (LEAD_ONLY.some((p) => pathname.startsWith(p)) && session.role === "agent") return NextResponse.redirect(denied);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
