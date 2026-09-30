import { randomAvatar } from "./avatars";
import {
  getSql,
  isDatabaseConfigured,
  safeDbError,
  type Sql,
} from "./db";
import type { Bot, StreamEvent } from "./types";

type Listener = (event: StreamEvent) => void;

type GlobalStore = {
  bots: Map<string, Bot>;
  listeners: Set<Listener>;
  schemaReady: Promise<void> | null;
};

const globalForBots = globalThis as typeof globalThis & {
  __grokbotStore?: GlobalStore;
};

function getStore(): GlobalStore {
  if (!globalForBots.__grokbotStore) {
    globalForBots.__grokbotStore = {
      bots: new Map(),
      listeners: new Set(),
      schemaReady: null,
    };
  }
  return globalForBots.__grokbotStore;
}

function broadcast(event: StreamEvent) {
  for (const listener of getStore().listeners) {
    try {
      listener(event);
    } catch {
      // Drop broken listeners; unsubscribe happens on stream cancel.
    }
  }
}

function remember(bot: Bot) {
  getStore().bots.set(bot.id, bot);
}

function forgetAll() {
  getStore().bots.clear();
}

type BotRow = {
  id: unknown;
  name: unknown;
  avatar: unknown;
  created_at: unknown;
};

function rowToBot(row: BotRow | undefined): Bot | null {
  if (!row) return null;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.name !== "string" || !row.name.trim()) return null;
  if (typeof row.avatar !== "string" || !row.avatar) return null;
  const createdAt = toEpochMs(row.created_at);
  if (createdAt === null) return null;
  return {
    id: row.id,
    name: row.name.trim(),
    avatar: row.avatar,
    createdAt,
  };
}

function toEpochMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function ensureSchema(sql: Sql): Promise<void> {
  const store = getStore();
  if (!store.schemaReady) {
    store.schemaReady = sql`
      CREATE TABLE IF NOT EXISTS bots (
        id text PRIMARY KEY,
        name text NOT NULL,
        avatar text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `
      .then(() => undefined)
      .catch((error: unknown) => {
        store.schemaReady = null;
        throw error;
      });
  }
  return store.schemaReady;
}

async function listBotsFromDb(): Promise<Bot[]> {
  const sql = getSql();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT id, name, avatar, created_at
    FROM bots
    ORDER BY created_at ASC, id ASC
  `;
  const bots: Bot[] = [];
  for (const row of rows) {
    const bot = rowToBot(row as BotRow);
    if (bot) bots.push(bot);
  }
  return bots;
}

async function insertBotDb(bot: Bot): Promise<Bot | null> {
  const sql = getSql();
  await ensureSchema(sql);
  const createdAt = new Date(bot.createdAt).toISOString();
  const rows = await sql`
    INSERT INTO bots (id, name, avatar, created_at)
    VALUES (${bot.id}, ${bot.name}, ${bot.avatar}, ${createdAt})
    ON CONFLICT (id) DO NOTHING
    RETURNING id, name, avatar, created_at
  `;
  if (rows.length > 0) {
    return rowToBot(rows[0] as BotRow);
  }
  // Conflict: return the existing row so callers stay idempotent.
  const existing = await sql`
    SELECT id, name, avatar, created_at
    FROM bots
    WHERE id = ${bot.id}
    LIMIT 1
  `;
  return rowToBot(existing[0] as BotRow);
}

async function deleteAllBotsDb(): Promise<void> {
  const sql = getSql();
  await ensureSchema(sql);
  await sql`DELETE FROM bots`;
}

/**
 * Current bot list. Uses Neon when DATABASE_URL(_POOLED) is set so every
 * serverless instance shares the same check-ins; otherwise process memory.
 */
export async function listBots(): Promise<Bot[]> {
  if (!isDatabaseConfigured()) {
    return Array.from(getStore().bots.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  try {
    const bots = await listBotsFromDb();
    forgetAll();
    for (const bot of bots) remember(bot);
    return bots;
  } catch (error) {
    console.error("Bot list failed", safeDbError(error));
    // Fall back to whatever this instance still has in memory.
    return Array.from(getStore().bots.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }
}

export function getBot(id: string): Bot | undefined {
  return getStore().bots.get(id);
}

export async function spawnBot(input: {
  name: string;
  id?: string;
  avatar?: string;
}): Promise<Bot | null> {
  const name = input.name.trim();
  if (!name) return null;

  const id = input.id?.trim() || crypto.randomUUID();
  const existingMem = getStore().bots.get(id);
  if (existingMem && !isDatabaseConfigured()) return existingMem;

  const candidate: Bot = {
    id,
    name,
    avatar: input.avatar ?? randomAvatar(),
    createdAt: Date.now(),
  };

  if (!isDatabaseConfigured()) {
    remember(candidate);
    broadcast({ type: "spawn", bot: candidate });
    return candidate;
  }

  try {
    const saved = await insertBotDb(candidate);
    if (!saved) return null;

    const alreadyKnown = getStore().bots.has(saved.id);
    remember(saved);
    if (!alreadyKnown) {
      broadcast({ type: "spawn", bot: saved });
    }
    return saved;
  } catch (error) {
    console.error("Bot spawn failed", safeDbError(error));
    // Still spawn in-memory so a transient DB blip does not drop a check-in
    // on this instance; durable share resumes on the next successful write.
    if (!getStore().bots.has(candidate.id)) {
      remember(candidate);
      broadcast({ type: "spawn", bot: candidate });
    }
    return getStore().bots.get(candidate.id) ?? candidate;
  }
}

export async function resetBots(): Promise<void> {
  if (isDatabaseConfigured()) {
    try {
      await deleteAllBotsDb();
    } catch (error) {
      console.error("Bot reset failed", safeDbError(error));
      throw error;
    }
  }
  forgetAll();
  broadcast({ type: "reset" });
}

export function subscribe(listener: Listener): () => void {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

/**
 * Push spawn/reset events for bots that appeared (or vanished via reset) on
 * another serverless instance. Call from long-lived SSE connections.
 */
export async function reconcileFromDatabase(
  knownIds: Set<string>,
): Promise<{ knownIds: Set<string>; events: StreamEvent[] }> {
  if (!isDatabaseConfigured()) {
    return { knownIds, events: [] };
  }

  let bots: Bot[];
  try {
    bots = await listBotsFromDb();
  } catch (error) {
    console.error("Bot reconcile failed", safeDbError(error));
    return { knownIds, events: [] };
  }

  const nextIds = new Set(bots.map((b) => b.id));
  const events: StreamEvent[] = [];

  if (knownIds.size > 0 && nextIds.size === 0) {
    forgetAll();
    events.push({ type: "reset" });
    return { knownIds: nextIds, events };
  }

  for (const bot of bots) {
    remember(bot);
    if (!knownIds.has(bot.id)) {
      events.push({ type: "spawn", bot });
    }
  }

  return { knownIds: nextIds, events };
}
