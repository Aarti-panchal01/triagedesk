import Link from "next/link";
export default function NotFound() {
  return (
    <main className="page">
      <h1>Not found</h1>
      <p className="muted" style={{ marginTop: 8 }}>That case or page does not exist. <Link href="/dashboard">Go to the dashboard</Link>.</p>
    </main>
  );
}
