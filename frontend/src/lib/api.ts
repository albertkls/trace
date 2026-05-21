import type {
  Attachment,
  AttachmentInput,
  AttachmentOwnerType,
  BackupInfo,
  CaptureBatchInput,
  CaptureBatchResult,
  CaptureInput,
  ComposeChunk,
  ComposeRequest,
  DailyActivity,
  InboxItem,
  LibraryScanResult,
  LibraryStatus,
  LLMProfile,
  Note,
  NoteInput,
  NotePatch,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectPatch,
  ProfileInput,
  ProfilePatch,
  Report,
  ReportCreate,
  ReportPatch,
  ReportSummary,
  RestoreResult,
  RewriteChunk,
  RewriteRequest,
  SearchResult,
  ThemePreferenceResponse,
  Thread,
  ThreadDetail,
  ThreadInput,
  ThreadPatchInput,
  Todo,
  TodoInput,
  TodoPatch,
  UpdateInfo,
  Workspace,
  WorkspaceInput,
} from "./types";
import { currentWorkspaceId } from "./workspace";

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Workspace": currentWorkspaceId(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => req<{ status: string }>("/health"),
  search: (q: string) =>
    req<SearchResult>(`/search?q=${encodeURIComponent(q)}`),
  attachments: {
    list: (ownerType: AttachmentOwnerType, ownerId: string) =>
      req<Attachment[]>(
        `/attachments?owner_type=${encodeURIComponent(ownerType)}&owner_id=${encodeURIComponent(ownerId)}`
      ),
    create: (body: AttachmentInput) =>
      req<Attachment>("/attachments", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    remove: (id: string) => req<void>(`/attachments/${id}`, { method: "DELETE" }),
    open: (id: string) =>
      req<{ ok: boolean; last_opened_at?: string }>(`/attachments/${id}/open`, {
        method: "POST",
      }),
    reveal: (id: string) =>
      req<{ ok: boolean }>(`/attachments/${id}/reveal`, { method: "POST" }),
  },
  workspaces: {
    list: () => req<Workspace[]>("/workspaces"),
    create: (body: WorkspaceInput) =>
      req<Workspace>("/workspaces", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patch: (id: string, body: Partial<WorkspaceInput>) =>
      req<Workspace>(`/workspaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) => req<void>(`/workspaces/${id}`, { method: "DELETE" }),
  },
  backups: {
    list: () => req<BackupInfo[]>("/backups"),
    create: () => req<BackupInfo>("/backups", { method: "POST" }),
    restore: (path: string) =>
      req<RestoreResult>("/backups/restore", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
  },
  preferences: {
    getTheme: () => req<ThemePreferenceResponse>("/preferences/theme"),
    setTheme: (preference: ThemePreferenceResponse["preference"]) =>
      req<ThemePreferenceResponse>("/preferences/theme", {
        method: "PUT",
        body: JSON.stringify({ preference }),
      }),
  },
  projects: {
    list: () => req<Project[]>("/projects"),
    get: (id: string) => req<ProjectDetail>(`/projects/${id}`),
    create: (body: ProjectInput) =>
      req<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patch: (id: string, body: ProjectPatch) =>
      req<ProjectDetail>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    summarize: (id: string) =>
      req<ProjectDetail>(`/projects/${id}/summarize`, { method: "POST" }),
    remove: (id: string) => req<void>(`/projects/${id}`, { method: "DELETE" }),
  },
  threads: {
    list: (projectId?: string) =>
      req<Thread[]>(`/threads${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
    get: (id: string) => req<ThreadDetail>(`/threads/${id}`),
    create: (body: ThreadInput) =>
      req<Thread>("/threads", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: string, body: ThreadPatchInput) =>
      req<Thread>(`/threads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    summarize: (id: string) =>
      req<Thread>(`/threads/${id}/summarize`, { method: "POST" }),
    remove: (id: string) => req<void>(`/threads/${id}`, { method: "DELETE" }),
  },
  captures: {
    inbox: () => req<InboxItem[]>("/captures/inbox"),
    create: (body: CaptureInput) =>
      req<InboxItem>("/captures", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      id: string,
      patch: {
        text?: string;
        event_date?: string | null;
        category?: string;
        thread_id?: string | null;
        clear_thread?: boolean;
      }
    ) =>
      req<InboxItem>(`/captures/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    remove: (id: string) => req<void>(`/captures/${id}`, { method: "DELETE" }),
    batch: (body: CaptureBatchInput) =>
      req<CaptureBatchResult>("/captures/batch", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    promoteToTodo: (id: string, body: { due_date?: string | null; text?: string } = {}) =>
      req<Todo>(`/captures/${id}/promote-todo`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    promoteNoteToEvidence: (noteId: string, body: { text?: string; category?: string; event_date?: string; thread_id?: string | null } = {}) =>
      req<InboxItem>(`/captures/from-note/${noteId}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  reports: {
    list: (projectId?: string) =>
      req<ReportSummary[]>(`/reports${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
    get: (id: string) => req<Report>(`/reports/${id}`),
    create: (body: ReportCreate) =>
      req<Report>("/reports", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patch: (id: string, body: ReportPatch) =>
      req<Report>(`/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) => req<void>(`/reports/${id}`, { method: "DELETE" }),
    compose: async function* (
      id: string,
      body: ComposeRequest = {}
    ): AsyncGenerator<ComposeChunk> {
      const res = await fetch(`${BASE}/reports/${id}/compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      }
      yield* readSSE<ComposeChunk>(res.body);
    },
    rewrite: async function* (
      id: string,
      body: RewriteRequest
    ): AsyncGenerator<RewriteChunk> {
      const res = await fetch(`${BASE}/reports/${id}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
      }
      yield* readSSE<RewriteChunk>(res.body);
    },
  },
  todos: {
    list: (done?: boolean) => {
      const q =
        typeof done === "boolean" ? `?done=${done ? 1 : 0}` : "";
      return req<Todo[]>(`/todos${q}`);
    },
    create: (body: TodoInput) =>
      req<Todo>("/todos", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: string, body: TodoPatch) =>
      req<Todo>(`/todos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) => req<void>(`/todos/${id}`, { method: "DELETE" }),
  },
  notes: {
    list: (projectId?: string) =>
      req<Note[]>(`/notes${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
    get: (id: string) => req<Note>(`/notes/${id}`),
    create: (body: NoteInput) =>
      req<Note>("/notes", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: string, body: NotePatch) =>
      req<Note>(`/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: string) => req<void>(`/notes/${id}`, { method: "DELETE" }),
  },
  library: {
    status: () => req<LibraryStatus>("/library"),
    configure: (path: string, autoScan?: boolean) =>
      req<{ path: string; exists: boolean; auto_scan: boolean }>("/library/config", {
        method: "POST",
        body: JSON.stringify({ path, auto_scan: autoScan }),
      }),
    scan: (path?: string) =>
      req<LibraryScanResult>("/library/scan", {
        method: "POST",
        body: JSON.stringify(path ? { path } : {}),
      }),
    reveal: (path: string) =>
      req<{ ok: boolean }>("/library/reveal", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
  },
  llm: {
    list: () => req<LLMProfile[]>("/llm/profiles"),
    create: (body: ProfileInput) =>
      req<LLMProfile>("/llm/profiles", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, patch: ProfilePatch) =>
      req<LLMProfile>(`/llm/profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    remove: (id: string) =>
      req<void>(`/llm/profiles/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      req<{ ok: boolean; latency_ms: number; reply: string }>(
        `/llm/profiles/${id}/test`,
        { method: "POST" }
      ),
  },
  activity: {
    daily: (date?: string) =>
      req<DailyActivity>(`/activity/daily${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  },
  updater: {
    check: () => req<UpdateInfo>("/updater/check"),
    download: (dmgUrl: string, expectedSha256?: string | null) =>
      req<{ dmg_path: string; sha256: string }>("/updater/download", {
        method: "POST",
        body: JSON.stringify({
          dmg_url: dmgUrl,
          expected_sha256: expectedSha256 || undefined,
        }),
      }),
    apply: (dmgPath: string) =>
      req<{ ok: boolean }>("/updater/apply", {
        method: "POST",
        body: JSON.stringify({ dmg_path: dmgPath }),
      }),
  },
};

async function* readSSE<T extends { type: string }>(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseEvent<T>(raw);
      if (parsed) yield parsed;
    }
  }
}

function parseEvent<T extends { type: string }>(block: string): T | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    const payload = JSON.parse(dataLines.join("\n"));
    return { type: event, ...payload } as T;
  } catch {
    return null;
  }
}
