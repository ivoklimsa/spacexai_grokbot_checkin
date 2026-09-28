"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import type { Bot, Project } from "@/lib/types";

type ProjectResponse = { project?: Project; error?: string };
type ProjectListResponse = { projects?: Project[]; error?: string };

const SUGGESTION_LIMIT = 8;

function formatRegisteredAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function ProjectBoard() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [participant, setParticipant] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [participantOpen, setParticipantOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const suggestionsId = useId();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        const data = (await response.json()) as ProjectListResponse;
        if (cancelled) return;
        if (!response.ok) {
          setLoadError(data.error ?? "Couldn't load projects");
          setProjects(null);
          return;
        }
        setProjects(data.projects ?? []);
        setLoadError(null);
      } catch {
        if (cancelled) return;
        setLoadError("Couldn't load projects");
        setProjects(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCheckInNames().then((next) => {
      if (!cancelled && next !== null) setNames(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = participant.trim().toLowerCase();
  const matches = names
    .filter((name) => name.toLowerCase().includes(query))
    .slice(0, SUGGESTION_LIMIT);
  const showSuggestions =
    participantOpen && names.length > 0 && matches.length > 0;

  async function refreshNames() {
    const next = await loadCheckInNames();
    if (next !== null) setNames(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const name = projectName.replace(/\s+/g, " ").trim();
    if (!name) {
      setError("Project name is required");
      setSuccess(null);
      nameRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: name,
          participant,
          githubUrl,
          webUrl,
        }),
      });
      const data = (await response.json()) as ProjectResponse;
      if (!response.ok || !data.project) {
        throw new Error(data.error ?? "Couldn't register project");
      }

      const created = data.project;
      setProjectName("");
      setParticipant("");
      setGithubUrl("");
      setWebUrl("");
      setParticipantOpen(false);
      setSuccess(`Registered "${created.projectName}".`);
      setProjects((prev) => {
        const rest = (prev ?? []).filter((item) => item.id !== created.id);
        return [created, ...rest];
      });
      setLoadError(null);
      nameRef.current?.focus();

      try {
        const listed = await fetch("/api/projects", { cache: "no-store" });
        const body = (await listed.json()) as ProjectListResponse;
        if (listed.ok) setProjects(body.projects ?? []);
      } catch {
        // The created row is already in the list.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't register project");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function onParticipantKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setParticipantOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      setParticipant(matches[activeIndex] ?? "");
      setParticipantOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Projects
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Register a project for this event.
        </p>
      </header>

      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5"
      >
        <Field
          id="project-name"
          label="Project name"
          required
          value={projectName}
          inputRef={nameRef}
          onChange={(value) => {
            setProjectName(value);
            setError(null);
          }}
          autoComplete="off"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="participant" className="text-sm font-medium">
            Participant{" "}
            <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          {names.length > 0 ? (
            <p className="text-xs text-zinc-500">
              Suggestions come from current check-ins. Any name is fine.
            </p>
          ) : null}
          <div className="relative">
            <input
              id="participant"
              name="participant"
              type="text"
              value={participant}
              autoComplete="off"
              role={names.length > 0 ? "combobox" : undefined}
              aria-autocomplete={names.length > 0 ? "list" : undefined}
              aria-expanded={names.length > 0 ? showSuggestions : undefined}
              aria-controls={names.length > 0 ? suggestionsId : undefined}
              aria-activedescendant={
                showSuggestions && activeIndex >= 0
                  ? `${suggestionsId}-${activeIndex}`
                  : undefined
              }
              onChange={(event) => {
                setParticipant(event.target.value);
                setParticipantOpen(true);
                setActiveIndex(-1);
                setError(null);
              }}
              onFocus={() => {
                setParticipantOpen(true);
                void refreshNames();
              }}
              onBlur={() => {
                setParticipantOpen(false);
                setActiveIndex(-1);
              }}
              onKeyDown={onParticipantKeyDown}
              className={inputClassName}
            />
            {showSuggestions ? (
              <ul
                id={suggestionsId}
                role="listbox"
                className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
              >
                {matches.map((name, index) => (
                  <li key={name} id={`${suggestionsId}-${index}`} role="option" aria-selected={index === activeIndex}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm ${
                        index === activeIndex ? "bg-zinc-100" : "hover:bg-zinc-50"
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setParticipant(name);
                        setParticipantOpen(false);
                        setActiveIndex(-1);
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <Field
          id="github-url"
          label="GitHub link"
          optional
          value={githubUrl}
          onChange={(value) => {
            setGithubUrl(value);
            setError(null);
          }}
          placeholder="https://github.com/org/repo"
          autoComplete="off"
          spellCheck={false}
        />
        <Field
          id="web-url"
          label="Web page"
          optional
          value={webUrl}
          onChange={(value) => {
            setWebUrl(value);
            setError(null);
          }}
          placeholder="https://example.com"
          autoComplete="off"
          spellCheck={false}
        />

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-emerald-800">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {submitting ? "Registering…" : "Register project"}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500">Submitted</h2>
        {loadError ? (
          <p role="alert" className="text-sm text-red-700">
            {loadError}
          </p>
        ) : projects === null ? (
          <p className="text-sm text-zinc-500">Loading projects…</p>
        ) : projects.length === 0 ? (
          <p>No projects yet</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <li
                key={project.id}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 break-words font-medium">
                    {project.projectName}
                  </h3>
                  {formatRegisteredAt(project.createdAt) ? (
                    <time
                      dateTime={project.createdAt}
                      className="shrink-0 text-xs tabular-nums text-zinc-500"
                    >
                      {formatRegisteredAt(project.createdAt)}
                    </time>
                  ) : null}
                </div>
                {project.participant ? (
                  <Detail label="Participant" value={project.participant} />
                ) : null}
                {project.githubUrl ? (
                  <Detail label="GitHub" value={project.githubUrl} />
                ) : null}
                {project.webUrl ? <Detail label="Web" value={project.webUrl} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

async function loadCheckInNames(): Promise<string[] | null> {
  try {
    const response = await fetch("/api/bots", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { bots?: Bot[] };
    const seen = new Set<string>();
    const names: string[] = [];
    for (const bot of data.bots ?? []) {
      const name = bot.name?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  } catch {
    return null;
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-1 break-all text-sm text-zinc-700">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-400"> · </span>
      {isHttpUrl(value) ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-zinc-300 underline-offset-2"
        >
          {value}
        </a>
      ) : (
        value
      )}
    </p>
  );
}

const inputClassName =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200";

function Field({
  id,
  label,
  value,
  onChange,
  required,
  optional,
  placeholder,
  autoComplete,
  spellCheck,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  autoComplete?: string;
  spellCheck?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}{" "}
        {required ? (
          <span className="text-red-700" aria-hidden="true">
            *
          </span>
        ) : null}
        {optional ? (
          <span className="font-normal text-zinc-500">(optional)</span>
        ) : null}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={id}
        type="text"
        required={required}
        aria-required={required || undefined}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      />
    </div>
  );
}
