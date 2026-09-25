export const AVATARS = [
  "/avatars/bot-01.png",
  "/avatars/bot-02.png",
  "/avatars/bot-03.png",
  "/avatars/bot-04.png",
  "/avatars/bot-05.png",
  "/avatars/bot-06.png",
  "/avatars/bot-07.png",
  "/avatars/bot-08.png",
  "/avatars/bot-09.png",
  "/avatars/bot-10.png",
  "/avatars/bot-11.png",
  "/avatars/bot-12.png",
] as const;

export function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}
