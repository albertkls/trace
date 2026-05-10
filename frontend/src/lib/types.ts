export type ThreadStatus = "active" | "blocked" | "done" | "archived";
export type Category = "progress" | "decision" | "risk" | "plan" | "support";
export type ItemStatus = "done" | "ongoing" | "blocked" | "planned";
export type ProjectStatus = "active" | "paused" | "done" | "archived";

export interface Workspace {
  id: string;
  name: string;
  theme_color: string | null;
  default_llm_profile_id: string | null;
  created_at: string;
  updated_at: string;
  project_count?: number;
  thread_count?: number;
}

export interface WorkspaceInput {
  name: string;
  theme_color?: string | null;
  default_llm_profile_id?: string | null;
}

export interface Project {
  id: string;
  workspace_id?: string;
  name: string;
  status: ProjectStatus;
  owner: string | null;
  summary: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  thread_count?: number;
  note_count?: number;
  report_count?: number;
}

export interface Thread {
  id: string;
  workspace_id?: string;
  title: string;
  project: string | null;
  project_id?: string | null;
  owner: string | null;
  status: ThreadStatus;
  started_at: string;
  last_active_at: string;
  summary: string;
  pinned: number;
  evidence_count?: number;
}

export interface Evidence {
  id: string;
  workspace_id?: string;
  thread_id: string | null;
  thread_title?: string | null;
  thread_project?: string | null;
  text: string;
  event_date: string | null;
  owners: string[];
  tags: string[];
  category: Category;
  status: ItemStatus;
  importance: number;
  created_at: string;
}

export interface Todo {
  id: string;
  workspace_id?: string;
  thread_id: string | null;
  thread_title?: string | null;
  text: string;
  due_date: string | null;
  done: number | boolean;
  done_at: string | null;
  created_at: string;
}

export interface TodoInput {
  text: string;
  due_date?: string | null;
  thread_id?: string | null;
}

export interface TodoPatch {
  text?: string;
  due_date?: string | null;
  done?: boolean;
  thread_id?: string | null;
  clear_thread?: boolean;
  clear_due_date?: boolean;
}

export interface Note {
  id: string;
  workspace_id?: string;
  title: string;
  body_md: string;
  day: string;
  project_id?: string | null;
  project_name?: string | null;
  thread_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface NoteInput {
  title?: string;
  body_md?: string;
  day?: string;
  project_id?: string | null;
  thread_ids?: string[];
}

export interface NotePatch {
  title?: string;
  body_md?: string;
  day?: string;
  project_id?: string | null;
  clear_project?: boolean;
  thread_ids?: string[];
}

export interface ThreadDetail extends Thread {
  evidence: Evidence[];
  todos: Todo[];
}

export interface OutlineNode {
  id: string;
  title: string;
  level: 1 | 2 | 3;
}

export interface EvidenceRef {
  id: string;
  text: string;
  event_date: string | null;
  category: Category;
  status: ItemStatus;
  importance: number;
  owners: string[];
  tags: string[];
  thread_id: string | null;
  thread_title: string | null;
  thread_project?: string | null;
  missing?: boolean;
}

export interface Report {
  id: string;
  workspace_id?: string;
  period_label: string;
  period_start: string;
  period_end: string;
  audience: "boss" | "internal" | "1on1" | "retro" | "self";
  project_id?: string | null;
  project_name?: string | null;
  thread_ids: string[];
  title: string;
  body_md: string;
  outline: OutlineNode[];
  cited_evidence: string[];
  cited_evidence_detail: EvidenceRef[];
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export type ReportAudience = "boss" | "internal" | "1on1" | "retro" | "self";
export type ReportStatus = "draft" | "final" | "archived";

export interface ReportSummary {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  audience: ReportAudience;
  project_id?: string | null;
  project_name?: string | null;
  thread_ids: string[];
  title: string;
  status: ReportStatus;
  updated_at: string;
}

export interface ReportCreate {
  period_start: string;
  period_end: string;
  audience?: ReportAudience;
  project_id?: string | null;
  thread_ids?: string[];
  period_label?: string;
  title?: string;
  body_md?: string;
}

export interface ReportPatch {
  title?: string;
  body_md?: string;
  outline?: OutlineNode[];
  status?: ReportStatus;
  period_start?: string;
  period_end?: string;
  period_label?: string;
  audience?: ReportAudience;
  project_id?: string | null;
  clear_project?: boolean;
  thread_ids?: string[];
}

export interface ProjectDetail extends Project {
  threads: Thread[];
  notes: Note[];
  reports: ReportSummary[];
  todos: Todo[];
  evidence: Evidence[];
}

export interface ProjectInput {
  name: string;
  status?: ProjectStatus;
  owner?: string | null;
  summary?: string;
  color?: string | null;
}

export interface ProjectPatch {
  name?: string;
  status?: ProjectStatus;
  owner?: string | null;
  summary?: string;
  color?: string | null;
}

export type LLMProtocol = "openai-compat" | "anthropic";

export interface LLMProfile {
  id: string;
  name: string;
  provider: string;
  protocol: LLMProtocol;
  base_url: string;
  api_key: string;
  api_key_set: boolean;
  model: string;
  temperature: number;
  max_tokens: number;
  is_default: number;
}

export interface ProfileInput {
  name: string;
  provider: string;
  protocol: LLMProtocol;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_default: boolean;
}

export type ProfilePatch = Partial<ProfileInput>;

export interface ComposeChunk {
  type: "delta" | "done" | "error";
  text?: string;
  body_md?: string;
  cited_evidence?: string[];
  message?: string;
}

export type RewriteOp = "continue" | "compress" | "retone" | "custom";

export interface RewriteRequest {
  op: RewriteOp;
  profile_id?: string;
  target_chars?: number;
  target_audience?: ReportAudience;
  instruction?: string;
}

export interface RewriteChunk {
  type: "delta" | "done" | "error";
  text?: string;
  mode?: "append" | "replace";
  op?: RewriteOp;
  message?: string;
}

export interface InboxItem extends Evidence {
  source_title?: string | null;
  source_kind?: string | null;
  source_file_path?: string | null;
}

export interface LibraryStatus {
  path: string | null;
  exists: boolean;
  source_count: number;
  last_scan: string | null;
}

export interface LibraryScanResult {
  path: string;
  scanned: number;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  errors: Array<{ path: string; message: string }>;
}

export interface SearchResult {
  projects: Array<{ id: string; name: string; status: string; summary: string }>;
  threads: Array<{ id: string; title: string; project: string | null; status: string; summary: string }>;
  evidence: Array<{ id: string; text: string; category: Category; event_date: string | null; thread_id: string | null; thread_title: string | null }>;
  todos: Array<{ id: string; text: string; done: number; due_date: string | null; thread_id: string | null }>;
  notes: Array<{ id: string; title: string; day: string }>;
}

export interface CaptureInput {
  text: string;
  event_date?: string;
  category?: Category;
  thread_id?: string | null;
  source_kind?: "quicknote" | "meeting" | "file" | "import";
  source_title?: string;
}

export interface ThreadInput {
  title: string;
  project?: string | null;
  project_id?: string | null;
  owner?: string | null;
  summary?: string;
  pinned?: boolean;
  adopt_evidence_id?: string;
}

export interface ThreadPatchInput {
  title?: string;
  project?: string | null;
  project_id?: string | null;
  clear_project?: boolean;
  owner?: string | null;
  status?: ThreadStatus;
  summary?: string;
  pinned?: boolean;
  started_at?: string;
}

export interface DailyActivity {
  date: string;
  evidence: Evidence[];
  completed_todos: Array<{
    id: string;
    text: string;
    due_date: string | null;
    done_at: string | null;
    thread_id: string | null;
    thread_title: string | null;
  }>;
  active_threads: Array<{
    id: string;
    title: string;
    status: ThreadStatus;
    project_id: string | null;
    project_name: string | null;
  }>;
  capture_count: number;
  todo_done_count: number;
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url?: string;
  changelog?: string;
  published_at?: string;
  dmg_url?: string;
  dmg_size?: number;
  dmg_sha256?: string | null;
}
