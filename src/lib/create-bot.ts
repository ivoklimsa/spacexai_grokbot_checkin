import { randomAvatar } from "./avatars";
import type { Bot } from "./types";

/** Build a Bot on the client without touching the shared server store. */
export function createBot(name: string): Bot | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return {
    id: crypto.randomUUID(),
    name: trimmed,
    avatar: randomAvatar(),
    createdAt: Date.now(),
  };
}
