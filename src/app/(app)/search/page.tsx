import { requirePageSession } from "@/lib/auth";
import { SearchClient } from "./SearchClient";

export const metadata = { title: "Search" };

export default async function SearchPage() {
  await requirePageSession();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Search past cases and protocols</h1>
          <p>The same question, answered two ways: by meaning (pgvector) and by matching words (full-text search).</p>
        </div>
      </div>
      <SearchClient />
    </>
  );
}
