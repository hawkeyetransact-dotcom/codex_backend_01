/**
 * Vector DB migration — Wave 2 implementation.
 *
 * Provides a retrieval abstraction that can read from either pgvector or
 * the existing Mongo-cosine store. At boot, honours VECTOR_DB_BACKEND env:
 *   - "mongo"    (default) — legacy cosine over KbChunk
 *   - "pgvector" — use pg with pgvector extension
 *   - "dual"     — write to both, read from pgvector, shadow-compare
 *
 * Postgres driver (`pg`) is NOT currently in package.json. When enabled,
 * install: npm i pg. Until then, the pgvector path returns an error
 * telling the operator to install + configure PG_CONNECTION_STRING.
 */

const BACKEND = (process.env.VECTOR_DB_BACKEND || "mongo").toLowerCase();

let pgPool;
async function getPgPool() {
  if (pgPool) return pgPool;
  try {
    const { Pool } = await import("pg");
    pgPool = new Pool({
      connectionString: process.env.PG_CONNECTION_STRING,
      max: Number(process.env.PG_POOL_MAX || 10),
    });
    return pgPool;
  } catch (err) {
    throw new Error(
      "pgvector backend requested but 'pg' package not installed. Run `npm i pg` and set PG_CONNECTION_STRING. " +
      `Underlying error: ${err.message}`
    );
  }
}

/**
 * Ensure the schema exists. Idempotent. Run once at boot or migration.
 */
export async function ensurePgVectorSchema() {
  if (BACKEND === "mongo") return { ok: true, backend: "mongo", skipped: true };
  const pool = await getPgPool();
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   text NOT NULL,
      doc_id      text NOT NULL,
      chunk_index int  NOT NULL,
      content     text NOT NULL,
      embedding   vector(1536),
      metadata    jsonb,
      created_at  timestamptz DEFAULT now(),
      UNIQUE (tenant_id, doc_id, chunk_index)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS kb_chunks_tenant_idx ON kb_chunks (tenant_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS kb_chunks_ivf_idx ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`);
  return { ok: true, backend: "pgvector" };
}

/**
 * Upsert a chunk into pgvector.
 */
export async function writeChunkToPgVector({ tenantId, docId, chunkIndex, content, embedding, metadata }) {
  if (BACKEND === "mongo") return { ok: true, skipped: true };
  const pool = await getPgPool();
  const res = await pool.query(
    `INSERT INTO kb_chunks (tenant_id, doc_id, chunk_index, content, embedding, metadata)
     VALUES ($1,$2,$3,$4,$5::vector,$6::jsonb)
     ON CONFLICT (tenant_id, doc_id, chunk_index) DO UPDATE
     SET content = EXCLUDED.content, embedding = EXCLUDED.embedding,
         metadata = EXCLUDED.metadata
     RETURNING id`,
    [tenantId, docId, chunkIndex, content, toVectorLiteral(embedding), JSON.stringify(metadata || {})]
  );
  return { ok: true, id: res.rows[0]?.id };
}

/**
 * Retrieve top-K nearest chunks for an embedding.
 */
export async function retrieveFromPgVector({ tenantId, queryEmbedding, topK = 8, docIds }) {
  if (BACKEND === "mongo") throw new Error("pgvector retrieval called but VECTOR_DB_BACKEND=mongo");
  const pool = await getPgPool();
  const params = [tenantId, toVectorLiteral(queryEmbedding), topK];
  let extraFilter = "";
  if (Array.isArray(docIds) && docIds.length) {
    params.push(docIds);
    extraFilter = `AND doc_id = ANY($${params.length})`;
  }
  const res = await pool.query(
    `SELECT id, doc_id, chunk_index, content, metadata,
            1 - (embedding <=> $2::vector) AS score
       FROM kb_chunks
      WHERE tenant_id = $1 ${extraFilter}
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    params
  );
  return res.rows.map((r) => ({
    docId: r.doc_id, chunkId: r.chunk_index, content: r.content, score: Number(r.score), metadata: r.metadata,
  }));
}

/**
 * Backfill from Mongo kbChunks → pgvector. Paginated, idempotent.
 */
export async function backfillFromMongo({ KbChunk, batchSize = 500, sinceDate }) {
  if (BACKEND === "mongo") return { ok: true, skipped: true };
  if (!KbChunk) throw new Error("backfillFromMongo: KbChunk model is required");
  const filter = sinceDate ? { updatedAt: { $gte: new Date(sinceDate) } } : {};
  const cursor = KbChunk.find(filter).cursor();
  let processed = 0;
  for await (const doc of cursor) {
    await writeChunkToPgVector({
      tenantId: doc.tenantId,
      docId: doc.docId,
      chunkIndex: doc.chunkIndex,
      content: doc.content,
      embedding: doc.embedding,
      metadata: doc.metadata,
    });
    processed++;
    if (processed % batchSize === 0) console.log(`[vectorDbMigration] backfill processed=${processed}`);
  }
  return { ok: true, processed };
}

function toVectorLiteral(vec) {
  if (!Array.isArray(vec) || !vec.length) throw new Error("embedding must be a non-empty number array");
  return `[${vec.map((n) => Number(n).toFixed(6)).join(",")}]`;
}

export const __private = { BACKEND, toVectorLiteral };
