export const SAMPLE_NAMES = [
  "Alex Rivera",
  "Jordan Lee",
  "Sam Okonkwo",
  "Riley Chen",
  "Morgan Blake",
  "Casey Nguyen",
  "Quinn Patel",
  "Avery Kim",
  "Jamie Torres",
  "Taylor Brooks",
  "Drew Santos",
  "Reese Alvarez",
  "Harper Singh",
  "Cameron Diaz",
  "Skyler Moss",
];

export function randomSampleName(): string {
  return SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
}
