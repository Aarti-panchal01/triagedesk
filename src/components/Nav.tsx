"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/session-token";

const LINKS: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases/new", label: "New call" },
  { href: "/cases", label: "Cases" },
  { href: "/search", label: "Search" },
  { href: "/protocols", label: "Protocols" },
  { href: "/reports", label: "Reports", roles: ["supervisor", "admin"] },
  { href: "/admin/users", label: "Users", roles: ["admin"] },
];

export function Nav({ role, name }: { role: Role; name: string }) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) =>
    href === "/cases" ? path === "/cases" || (/^\/cases\/\d+/.test(path)) : path.startsWith(href);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/dashboard" className="wordmark">
          <span className="wordmark-mark" aria-hidden>TD</span>
          TriageDesk
        </Link>
        <nav className="nav" aria-label="Main">
          {LINKS.filter((l) => !l.roles || l.roles.includes(role)).map((l) => (
            <Link key={l.href} href={l.href} aria-current={active(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="whoami">
          <span><strong>{name}</strong>, {role}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}
