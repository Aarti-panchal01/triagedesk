import { Nav } from "@/components/Nav";
import { requirePageSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePageSession();
  return (
    <>
      <Nav role={s.role} name={s.name} />
      <main className="page">{children}</main>
    </>
  );
}
