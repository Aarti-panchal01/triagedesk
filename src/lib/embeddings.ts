/**
 * Sentence embeddings for semantic search.
 *
 * Model: sentence-transformers/all-MiniLM-L6-v2 (ONNX build "Xenova/all-MiniLM-L6-v2"),
 * run locally with transformers.js. Output: 384-dim, mean pooled, L2 normalised,
 * so cosine distance (pgvector's <=> operator) is the natural metric.
 *
 * EMBEDDING_PROVIDER=hash is an offline fallback (feature hashing of words).
 * It only captures word overlap, so use it for tests, never for the demo.
 */
export const EMBEDDING_DIM = 384;
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

type Extractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array }>;

const g = globalThis as unknown as { __tdExtractor?: Promise<Extractor> };

function provider(): "local" | "hash" {
  return process.env.EMBEDDING_PROVIDER === "hash" ? "hash" : "local";
}

async function getExtractor(): Promise<Extractor> {
  if (!g.__tdExtractor) {
    g.__tdExtractor = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.MODEL_CACHE_DIR ?? "./.cache/models";
      const pipe = await pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "fp32" });
      return pipe as unknown as Extractor;
    })();
    // If loading fails, allow a retry on the next call instead of caching the error
    g.__tdExtractor.catch(() => (g.__tdExtractor = undefined));
  }
  return g.__tdExtractor;
}

function normalise(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 2000);
}

function hashEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const raw of words) {
    if (raw.length < 3) continue;
    const w = raw.replace(/(ing|ed|es|s)$/, "");
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    v[Math.abs(h) % EMBEDDING_DIM] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export async function embed(text: string): Promise<number[]> {
  const clean = normalise(text);
  if (!clean) throw new Error("Cannot embed empty text");
  if (provider() === "hash") return hashEmbed(clean);
  const extractor = await getExtractor();
  const out = await extractor(clean, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

/** pgvector accepts the text form '[x1,x2,...]' and casts it with ::vector */
export function toPgVector(v: number[]): string {
  if (v.length !== EMBEDDING_DIM) throw new Error(`Expected ${EMBEDDING_DIM} dims, got ${v.length}`);
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`;
}

/** Text we embed for a case: the complaint, plus the resolution once known */
export function caseEmbeddingText(c: { category: string; chief_complaint: string; resolution_notes?: string | null }) {
  return `${c.category}. ${c.chief_complaint}${c.resolution_notes ? ` Resolution: ${c.resolution_notes}` : ""}`;
}

export function protocolEmbeddingText(p: { title: string; category: string; content: string }) {
  return `${p.title}. ${p.category}. ${p.content}`;
}
