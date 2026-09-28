import { NextResponse } from "next/server";
import { parseProjectInput } from "@/lib/project-input";
import {
  createProject,
  deleteAllProjects,
  listProjects,
  ProjectStoreError,
} from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    return storeError(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseProjectInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const project = await createProject(parsed.value);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return storeError(error);
  }
}

export async function DELETE() {
  try {
    await deleteAllProjects();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeError(error);
  }
}

function storeError(error: unknown) {
  if (error instanceof ProjectStoreError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Project request failed");
  return NextResponse.json(
    { error: "Project store request failed" },
    { status: 500 },
  );
}
