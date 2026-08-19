import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const BACKFILL_BATCH_SIZE = 200;
const BACKFILL_IDLE_SLEEP_MS = 50;
const BACKFILL_MAX_ROWS = 50_000;

type CacheBackfillSource = {
  cachedTokens: number | null;
  cacheWriteTokens: number | null;
  promptTokensIncludeCache: boolean | null;
};

function resolveCacheBackfillSource(billingDetails: unknown): CacheBackfillSource | null {
  if (!billingDetails || typeof billingDetails !== 'object') return null;
  const details = billingDetails as Record<string, unknown>;
  if (!details.usage || typeof details.usage !== 'object') return null;
  const usage = details.usage as Record<string, unknown>;
  if (usage.cacheReadTokens === undefined && usage.cacheCreationTokens === undefined && usage.promptTokensIncludeCache === undefined) {
    return null;
  }

  const toInt = (value: unknown): number | null => {
    if (typeof value !== 'number') return null;
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.round(value));
  };
  const includeCache = usage.promptTokensIncludeCache;
  return {
    cachedTokens: toInt(usage.cacheReadTokens),
    cacheWriteTokens: toInt(usage.cacheCreationTokens),
    promptTokensIncludeCache: typeof includeCache === 'boolean' ? includeCache : null,
  };
}

function parseStoredBillingDetails(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type BackfillBatchRow = {
  id: number;
  billingDetails: unknown;
};

async function fetchBackfillBatch(afterId: number, limit: number): Promise<BackfillBatchRow[]> {
  return await db
    .select({
      id: schema.proxyLogs.id,
      billingDetails: schema.proxyLogs.billingDetails,
    })
    .from(schema.proxyLogs)
    .where(and(
      gt(schema.proxyLogs.id, afterId),
      isNull(schema.proxyLogs.cachedTokens),
      sql`${schema.proxyLogs.billingDetails} is not null`,
    ))
    .orderBy(schema.proxyLogs.id)
    .limit(limit)
    .all() as BackfillBatchRow[];
}

export async function runProxyLogCacheBackfillOnce(input: {
  limit?: number;
} = {}): Promise<{ processed: number; updated: number; done: boolean }> {
  const maxRows = Math.min(
    Math.max(1, Math.trunc(input.limit ?? BACKFILL_MAX_ROWS)),
    BACKFILL_MAX_ROWS,
  );
  let lastId = 0;
  let processed = 0;
  let updated = 0;

  while (processed < maxRows) {
    const batch = await fetchBackfillBatch(lastId, BACKFILL_BATCH_SIZE);
    if (batch.length === 0) break;

    for (const row of batch) {
      lastId = row.id;
      processed += 1;
      const source = resolveCacheBackfillSource(parseStoredBillingDetails(row.billingDetails));
      if (!source) continue;
      await db.update(schema.proxyLogs)
        .set({
          cachedTokens: source.cachedTokens,
          cacheWriteTokens: source.cacheWriteTokens,
          promptTokensIncludeCache: source.promptTokensIncludeCache,
        })
        .where(eq(schema.proxyLogs.id, row.id))
        .run();
      updated += 1;
    }

    if (batch.length < BACKFILL_BATCH_SIZE) break;
    await new Promise((resolve) => setTimeout(resolve, BACKFILL_IDLE_SLEEP_MS));
  }

  const remaining = (await fetchBackfillBatch(lastId, 1)).length > 0;
  return { processed, updated, done: !remaining };
}
