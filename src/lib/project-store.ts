import { parseStoredProject, type ProjectInput } from "@/lib/project-input";
import type { Project } from "@/lib/types";

const PROJECTS_KEY = "spacexai:projects";
const REDIS_TIMEOUT_MS = 8000;

export class ProjectStoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProjectStoreError";
    this.status = status;
  }
}

export async function listProjects(): Promise<Project[]> {
  const raw = await redisCommand<unknown>(["LRANGE", PROJECTS_KEY, "0", "-1"]);
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new ProjectStoreError("Project store request failed", 502);
  }

  const projects: Project[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const project = parseStoredProject(entry);
    if (project) projects.push(project);
  }
  projects.reverse();
  return projects;
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    projectName: input.projectName,
    createdAt: new Date().toISOString(),
  };
  if (input.participant) project.participant = input.participant;
  if (input.githubUrl) project.githubUrl = input.githubUrl;
  if (input.webUrl) project.webUrl = input.webUrl;

  const length = await redisCommand<unknown>([
    "RPUSH",
    PROJECTS_KEY,
    JSON.stringify(project),
  ]);
  if (typeof length !== "number") {
    throw new ProjectStoreError("Project store request failed", 502);
  }
  return project;
}

function requireRedis(): { url: string; token: string } {
  const upstashUrl = clean(process.env.UPSTASH_REDIS_REST_URL);
  const upstashToken = clean(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (upstashUrl || upstashToken) {
    if (upstashUrl && upstashToken) {
      return { url: upstashUrl.replace(/\/$/, ""), token: upstashToken };
    }
    throw new ProjectStoreError("Project store is not configured", 503);
  }

  const kvUrl = clean(process.env.KV_REST_API_URL);
  const kvToken = clean(process.env.KV_REST_API_TOKEN);
  if (kvUrl && kvToken) {
    return { url: kvUrl.replace(/\/$/, ""), token: kvToken };
  }

  throw new ProjectStoreError("Project store is not configured", 503);
}

async function redisCommand<T>(command: string[]): Promise<T> {
  const { url, token } = requireRedis();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      "Project store request failed",
      error instanceof Error ? error.name : "error",
    );
    throw new ProjectStoreError("Project store request failed", 502);
  }

  let payload: { result?: T; error?: string };
  try {
    payload = (await response.json()) as { result?: T; error?: string };
  } catch {
    console.error("Project store returned a non-JSON response", response.status);
    throw new ProjectStoreError("Project store request failed", 502);
  }

  if (!response.ok || payload.error) {
    console.error("Project store request failed", response.status);
    throw new ProjectStoreError("Project store request failed", 502);
  }

  return payload.result as T;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}
