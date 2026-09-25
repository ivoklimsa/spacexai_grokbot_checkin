export type Bot = {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
};

export type SpawnEvent = {
  type: "spawn";
  bot: Bot;
};

export type ResetEvent = {
  type: "reset";
};

export type StreamEvent = SpawnEvent | ResetEvent;
