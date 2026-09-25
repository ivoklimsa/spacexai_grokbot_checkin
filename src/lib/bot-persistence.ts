import type { Bot } from "./types";

const STORAGE_KEY = "spacexai-checkin-bots";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isBot(value: unknown): value is Bot {
  if (!value || typeof value !== "object") return false;
  const bot = value as Partial<Bot>;
  return (
    typeof bot.id === "string" &&
    typeof bot.name === "string" &&
    typeof bot.avatar === "string" &&
    typeof bot.createdAt === "number"
  );
}

export function loadBots(): Bot[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBot).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export function saveBots(bots: Bot[]) {
  if (!canUseStorage()) return;
  try {
    const unique = new Map<string, Bot>();
    for (const bot of bots) {
      if (isBot(bot)) unique.set(bot.id, bot);
    }
    const list = Array.from(unique.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function upsertPersistedBot(bot: Bot) {
  if (!isBot(bot)) return;
  const current = loadBots();
  const next = current.some((b) => b.id === bot.id)
    ? current.map((b) => (b.id === bot.id ? bot : b))
    : [...current, bot];
  saveBots(next);
}

export function clearPersistedBots() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Union bots by id, keeping the earliest createdAt when both exist. */
export function mergeBots(a: Bot[], b: Bot[]): Bot[] {
  const map = new Map<string, Bot>();
  for (const bot of [...a, ...b]) {
    if (!isBot(bot)) continue;
    const existing = map.get(bot.id);
    if (!existing || bot.createdAt < existing.createdAt) {
      map.set(bot.id, bot);
    }
  }
  return Array.from(map.values()).sort((x, y) => x.createdAt - y.createdAt);
}
