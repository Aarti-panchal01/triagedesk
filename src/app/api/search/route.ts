import { NextResponse } from "next/server";
import { handler, requireApiSession } from "@/lib/api";
import { keywordSearch, semanticSearch } from "@/lib/search";
import { searchSchema } from "@/lib/validation";

export const POST = handler(async (req) => {
  await requireApiSession();
  const b = searchSchema.parse(await req.json());
  const opts = { category: b.category ?? undefined, closedOnly: b.closedOnly };
  const started = Date.now();
  const [semantic, keyword] = await Promise.all([
    b.mode !== "keyword" ? semanticSearch(b.q, opts) : null,
    b.mode !== "semantic" ? keywordSearch(b.q, opts) : null,
  ]);
  return NextResponse.json({ semantic, keyword, ms: Date.now() - started });
});
