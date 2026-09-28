const LIMITS = {
  projectName: 200,
  participant: 120,
  githubUrl: 2000,
  webUrl: 2000,
} as const;

export type ProjectInput = {
  projectName: string;
  participant?: string;
  githubUrl?: string;
  webUrl?: string;
};

export function parseProjectInput(
  body: unknown,
): { ok: true; value: ProjectInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid JSON" };
  }

  const record = body as Record<string, unknown>;
  const projectName = readText(record.projectName, "Project name", LIMITS.projectName, {
    collapseWhitespace: true,
  });
  if (!projectName.ok) return projectName;
  if (!projectName.value) {
    return { ok: false, error: "Project name is required" };
  }

  const participant = readText(record.participant, "Participant", LIMITS.participant, {
    collapseWhitespace: true,
  });
  if (!participant.ok) return participant;

  const githubUrl = readText(record.githubUrl, "GitHub link", LIMITS.githubUrl, {
    collapseWhitespace: false,
  });
  if (!githubUrl.ok) return githubUrl;

  const webUrl = readText(record.webUrl, "Web page", LIMITS.webUrl, {
    collapseWhitespace: false,
  });
  if (!webUrl.ok) return webUrl;

  const value: ProjectInput = { projectName: projectName.value };
  if (participant.value) value.participant = participant.value;
  if (githubUrl.value) value.githubUrl = githubUrl.value;
  if (webUrl.value) value.webUrl = webUrl.value;
  return { ok: true, value };
}

function readText(
  value: unknown,
  label: string,
  max: number,
  options: { collapseWhitespace: boolean },
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value == null) return { ok: true };
  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be text` };
  }

  const trimmed = options.collapseWhitespace
    ? value.replace(/\s+/g, " ").trim()
    : value.trim();
  if (!trimmed) return { ok: true };
  if (trimmed.length > max) {
    return { ok: false, error: `${label} is too long` };
  }
  return { ok: true, value: trimmed };
}
