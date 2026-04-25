import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { api } from "@/lib/api";
import {
  formatDateTime,
  toDateTimeInputValue,
} from "@/lib/periods";
import type { Thread, Todo, TodoPatch } from "@/lib/types";

export default function Todos() {
  const qc = useQueryClient();
  const [createError, setCreateError] = useState<string | null>(null);
  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => api.todos.list(),
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["todos"] });

  const create = useMutation({
    mutationFn: api.todos.create,
    onSuccess: () => {
      setCreateError(null);
      invalidate();
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const { open, done } = useMemo(() => {
    const open: Todo[] = [];
    const done: Todo[] = [];
    for (const t of todos) (t.done ? done : open).push(t);
    return { open, done };
  }, [todos]);

  return (
    <div className="mx-auto max-w-3xl px-10 py-10">
      <header className="mb-8">
        <div className="eyebrow">TODOS</div>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
          待办
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          轻量清单，每条可挂到对应的工作线。
        </p>
      </header>

      <QuickAdd
        threads={threads}
        onAdd={(payload) => create.mutateAsync(payload).then(() => undefined)}
        error={createError}
        pending={create.isPending}
      />

      {isLoading ? (
        <div className="panel mt-6 p-12 text-center text-sm text-ink-mute">
          加载中…
        </div>
      ) : todos.length === 0 ? (
        <div className="panel mt-6 p-12 text-center text-sm text-ink-mute">
          空清单。写下第一件要做的事。
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <TodoList
            title="待完成"
            count={open.length}
            items={open}
            threads={threads}
            onChanged={invalidate}
            empty="这里是空的——意味着所有事都做完了。"
          />
          {done.length > 0 && (
            <TodoList
              title="已完成"
              count={done.length}
              items={done}
              threads={threads}
              onChanged={invalidate}
              muted
            />
          )}
        </div>
      )}
    </div>
  );
}

function QuickAdd({
  threads,
  onAdd,
  error,
  pending,
}: {
  threads: Thread[];
  onAdd: (p: {
    text: string;
    due_date?: string | null;
    thread_id?: string | null;
  }) => Promise<void>;
  error: string | null;
  pending: boolean;
}) {
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [threadId, setThreadId] = useState<string>("");

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await onAdd({
        text: text.trim(),
        due_date: due || null,
        thread_id: threadId || null,
      });
      setText("");
      setDue("");
      setThreadId("");
    } catch {
      // Parent mutation owns the error copy; keep local inputs intact for retry.
    }
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <span className="mono-meta text-ink-faint">›</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="写下一件要做的事，回车添加…"
          className="input !border-transparent !bg-transparent !py-1.5 focus:!border-transparent"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          className="btn btn-accent"
          onClick={submit}
          disabled={pending || !text.trim()}
        >
          添加
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="chip cursor-pointer">
          <span className="mono-meta">截止</span>
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="bg-transparent font-mono text-[11px] text-ink outline-none"
          />
        </label>
        <label className="chip cursor-pointer">
          <span className="mono-meta">线程</span>
          <select
            value={threadId}
            onChange={(e) => setThreadId(e.target.value)}
            className="bg-transparent font-mono text-[11px] text-ink outline-none"
          >
            <option value="">无</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id} className="bg-canvas-raised">
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
          添加失败：{error}
        </div>
      )}
    </div>
  );
}

function TodoList({
  title,
  count,
  items,
  threads,
  onChanged,
  empty,
  muted,
}: {
  title: string;
  count: number;
  items: Todo[];
  threads: Thread[];
  onChanged: () => void;
  empty?: string;
  muted?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2">
        <span className="eyebrow">{title}</span>
        <span className="chip">{String(count).padStart(2, "0")}</span>
      </h2>
      {items.length === 0 && empty ? (
        <div className="panel p-5 text-center text-sm text-ink-mute">
          {empty}
        </div>
      ) : (
        <ul className={clsx("space-y-2", muted && "opacity-65")}>
          {items.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              threads={threads}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TodoRow({
  todo,
  threads,
  onChanged,
}: {
  todo: Todo;
  threads: Thread[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const [error, setError] = useState<string | null>(null);

  const patch = useMutation({
    mutationFn: (p: TodoPatch) => api.todos.patch(todo.id, p),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api.todos.remove(todo.id),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    setDraft(todo.text);
  }, [todo.id, todo.text]);

  const overdue =
    !todo.done &&
    todo.due_date &&
    Date.parse(todo.due_date) < Date.now();

  return (
    <li className="panel group flex items-start gap-3 p-3">
      <button
        aria-label={todo.done ? "标记为未完成" : "标记为完成"}
        onClick={() => patch.mutate({ done: !todo.done })}
        className={clsx(
          "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border text-[11px] transition",
          todo.done
            ? "border-accent bg-accent text-accent-ink"
            : "border-line bg-canvas-sunken hover:border-accent"
        )}
        style={
          todo.done
            ? { boxShadow: "0 0 10px rgba(94,230,197,0.35)" }
            : undefined
        }
      >
        {todo.done ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1">
        {error && (
          <div className="mb-2 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-1.5 text-xs text-signal-stop">
            操作失败：{error}
          </div>
        )}
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              const next = draft.trim();
              if (next && next !== todo.text) patch.mutate({ text: next });
              else setDraft(todo.text);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(todo.text);
                setEditing(false);
              }
            }}
            className="input !py-1"
          />
        ) : (
          <div className="flex items-start gap-1.5">
            <span
              className={clsx(
                "flex-1 text-sm leading-relaxed",
                todo.done ? "text-ink-mute line-through" : "text-ink"
              )}
            >
              {todo.text}
            </span>
            <button
              className="flex-shrink-0 rounded px-1 py-0.5 text-[11px] text-ink-faint opacity-70 transition hover:bg-canvas-contrast hover:text-ink"
              title="编辑"
              disabled={patch.isPending || remove.isPending}
              onClick={() => {
                setDraft(todo.text);
                setEditing(true);
              }}
            >
              编辑
            </button>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <DueDateChip
            value={todo.due_date}
            overdue={!!overdue}
            onChange={(v) =>
              v
                ? patch.mutate({ due_date: v })
                : patch.mutate({ clear_due_date: true })
            }
          />
          <ThreadSelect
            value={todo.thread_id}
            threads={threads}
            onChange={(v) =>
              v
                ? patch.mutate({ thread_id: v })
                : patch.mutate({ clear_thread: true })
            }
          />
          {todo.thread_id && todo.thread_title && (
            <Link
              to={`/threads/${todo.thread_id}`}
              className="chip chip-accent no-underline hover:brightness-125"
              title="跳转到线程"
            >
              → {todo.thread_title}
            </Link>
          )}
          <span className="mono-meta text-[10px] text-ink-faint">
            {formatDateTime(todo.created_at, { withYear: false, includeTime: true })}
          </span>
        </div>
      </div>

      <button
        className="btn btn-ghost flex-shrink-0 text-xs text-signal-stop opacity-80 transition hover:!bg-signal-stop/10 hover:!text-signal-stop"
        onClick={() => {
          if (window.confirm("删除这条待办？")) remove.mutate();
        }}
        disabled={patch.isPending || remove.isPending}
      >
        {remove.isPending ? "删除中…" : "删除"}
      </button>
    </li>
  );
}

function DueDateChip({
  value,
  overdue,
  onChange,
}: {
  value: string | null;
  overdue: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <label
      className={clsx(
        "chip cursor-pointer",
        overdue && "chip-stop"
      )}
    >
      <span className="font-mono text-[10px]">DUE</span>
      <input
        type="datetime-local"
        className="min-w-0 bg-transparent font-mono text-[11px] text-ink outline-none"
        value={toDateTimeInputValue(value)}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {value && (
        <button
          type="button"
          className="rounded px-1 text-[11px] text-ink-faint transition hover:bg-canvas-contrast hover:text-ink"
          onClick={(e) => {
            e.preventDefault();
            onChange(null);
          }}
          title="清除截止时间"
        >
          ×
        </button>
      )}
    </label>
  );
}

function ThreadSelect({
  value,
  threads,
  onChange,
}: {
  value: string | null;
  threads: Thread[];
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="chip cursor-pointer bg-canvas-raised/60 font-mono text-[11px]"
      title="归入线程"
    >
      <option value="" className="bg-canvas-raised">
        无线程
      </option>
      {threads.map((t) => (
        <option key={t.id} value={t.id} className="bg-canvas-raised">
          {t.title}
        </option>
      ))}
    </select>
  );
}
