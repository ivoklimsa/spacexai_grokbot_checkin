import type { ProjectInput } from "@/lib/project-input";
import type { Project } from "@/lib/types";
import { getSql, isDatabaseConfigured, safeDbError, type Sql } from "@/lib/db";

type ProjectRow = {
  id: unknown;
  project_name: unknown;
  participant: unknown;
  github_url: unknown;
  web_url: unknown;
  created_at: unknown;
};

export class ProjectStoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProjectStoreError";
    this.status = status;
  }
}

let schemaReady: Promise<void> | null = null;

export async function listProjects(): Promise<Project[]> {
  const rows = await withSql(
    (sql) => sql`
      SELECT id, project_name, participant, github_url, web_url, created_at
      FROM projects
      ORDER BY created_at DESC, id DESC
    `,
  );
  const projects: Project[] = [];
  for (const row of rows) {
    const project = rowToProject(row as ProjectRow);
    if (project) projects.push(project);
  }
  return projects;
}

export async function deleteAllProjects(): Promise<void> {
  await withSql((sql) => sql`DELETE FROM projects`);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const rows = await withSql(
    (sql) => sql`
      INSERT INTO projects (
        id,
        project_name,
        participant,
        github_url,
        web_url,
        created_at
      )
      VALUES (
        ${id},
        ${input.projectName},
        ${input.participant ?? null},
        ${input.githubUrl ?? null},
        ${input.webUrl ?? null},
        ${createdAt}
      )
      RETURNING id, project_name, participant, github_url, web_url, created_at
    `,
  );
  const project = rowToProject(rows[0] as ProjectRow);
  if (!project) {
    throw new ProjectStoreError("Project store request failed", 502);
  }
  return project;
}

async function withSql<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
  if (!isDatabaseConfigured()) {
    throw new ProjectStoreError("Project store is not configured", 503);
  }
  try {
    const sql = getSql();
    await ensureSchema(sql);
    return await run(sql);
  } catch (error) {
    if (error instanceof ProjectStoreError) throw error;
    console.error("Project store request failed", safeDbError(error));
    throw new ProjectStoreError("Project store request failed", 502);
  }
}

function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY,
        project_name text NOT NULL,
        participant text,
        github_url text,
        web_url text,
        created_at timestamptz NOT NULL
      )
    `
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

function rowToProject(row: ProjectRow | undefined): Project | null {
  if (!row) return null;
  if (typeof row.id !== "string" || !row.id) return null;
  if (typeof row.project_name !== "string" || !row.project_name.trim()) return null;
  const createdAt = toIso(row.created_at);
  if (!createdAt) return null;

  const project: Project = {
    id: row.id,
    projectName: row.project_name,
    createdAt,
  };
  if (typeof row.participant === "string" && row.participant) {
    project.participant = row.participant;
  }
  if (typeof row.github_url === "string" && row.github_url) {
    project.githubUrl = row.github_url;
  }
  if (typeof row.web_url === "string" && row.web_url) {
    project.webUrl = row.web_url;
  }
  return project;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}
