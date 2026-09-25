import { randomAvatar } from "./avatars";
import type { Bot, StreamEvent } from "./types";

type Listener = (event: StreamEvent) => void;

type GlobalStore = {
  bots: Map<string, Bot>;
  listeners: Set<Listener>;
};

const globalForBots = globalThis as typeof globalThis & {
  __grokbotStore?: GlobalStore;
};

function getStore(): GlobalStore {
  if (!globalForBots.__grokbotStore) {
    globalForBots.__grokbotStore = {
      bots: new Map(),
      listeners: new Set(),
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

export function listBots(): Bot[] {
  return Array.from(getStore().bots.values()).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

export function getBot(id: string): Bot | undefined {
  return getStore().bots.get(id);
}

export function spawnBot(input: {
  name: string;
  id?: string;
  avatar?: string;
}): Bot | null {
  const name = input.name.trim();
  if (!name) return null;

  const id = input.id?.trim() || crypto.randomUUID();
  const existing = getStore().bots.get(id);
  if (existing) return existing;

  const bot: Bot = {
    id,
    name,
    avatar: input.avatar ?? randomAvatar(),
    createdAt: Date.now(),
  };

  getStore().bots.set(id, bot);
  broadcast({ type: "spawn", bot });
  return bot;
}

export function resetBots() {
  getStore().bots.clear();
  broadcast({ type: "reset" });
}

export function subscribe(listener: Listener): () => void {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}
