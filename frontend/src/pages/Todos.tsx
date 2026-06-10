import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";
import DateTimeField from "@/components/DateTimeField";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/periods";
import { sanitizeTodoHtml, todoPreview, todoRichTextToPlainText } from "@/lib/richText";
import type { Thread, Todo, TodoPatch } from "@/lib/types";
import { TodoListSkeleton } from "@/components/Skeleton";

export default function Todos() {
  const qc = useQueryClient();
  const [createError, setCreateError] = useState<string | null>(null);
  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => api.todos.list(),
  });
  const { data: threads = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.threads.list().then((r) => r.items),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["todos"] });
    qc.invalidateQueries({ queryKey: ["thread"] });
    qc.invalidateQueries({ queryKey: ["project"] });
  };

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
        <p className="mt-2 text-sm text-ink-soft">轻量清单，每条可挂到对应的工作线。</p>
      </header>

      <QuickAdd
        threads={threads}
        onAdd={(payload) => create.mutateAsync(payload).then(() => undefined)}
        error={createError}
        pending={create.isPending}
      />

      {isLoading ? (
        <div className="mt-6">
          <TodoListSkeleton count={5} />
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
    const html = sanitizeTodoHtml(text);
    if (!todoRichTextToPlainText(html)) return;
    try {
      await onAdd({
        text: html,
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
      <div className="space-y-3">
        <RichTextComposer
          value={text}
          onChange={setText}
          placeholder="写下一件要做的事，支持加粗、列表和多行…"
          onSubmit={submit}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="chip">
          <span className="mono-meta">截止</span>
          <DateTimeField
            value={due}
            onChange={(next) => setDue(next ?? "")}
            className="min-w-[8.5rem]"
            buttonClassName="border-0 bg-transparent px-0 py-0 font-mono text-[11px] shadow-none hover:border-transparent"
            popoverClassName="-left-16"
          />
        </div>
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
        <button
          className="btn btn-accent ml-auto"
          onClick={submit}
          disabled={pending || !todoRichTextToPlainText(text)}
        >
          添加
        </button>
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
        <div className="panel p-5 text-center text-sm text-ink-mute">{empty}</div>
      ) : (
        <ul className={clsx("space-y-2", muted && "opacity-65")}>
          {items.map((t) => (
            <TodoRow key={t.id} todo={t} threads={threads} onChanged={onChanged} />
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

  const saveDraft = () => {
    const next = sanitizeTodoHtml(draft);
    if (!todoRichTextToPlainText(next)) {
      setDraft(todo.text);
      setEditing(false);
      return;
    }
    setEditing(false);
    if (next !== sanitizeTodoHtml(todo.text)) patch.mutate({ text: next });
  };

  const overdue = !todo.done && todo.due_date && Date.parse(todo.due_date) < Date.now();

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
        style={todo.done ? { boxShadow: "0 0 10px rgba(94,230,197,0.35)" } : undefined}
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
          <div className="space-y-2">
            <RichTextComposer
              value={draft}
              onChange={setDraft}
              placeholder="编辑待办内容…"
              autoFocus
              onSubmit={saveDraft}
              onCancel={() => {
                setDraft(todo.text);
                setEditing(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost text-xs"
                onClick={() => {
                  setDraft(todo.text);
                  setEditing(false);
                }}
              >
                取消
              </button>
              <button
                className="btn btn-accent text-xs"
                onClick={saveDraft}
                disabled={patch.isPending || !todoRichTextToPlainText(draft)}
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            <div
              className={clsx(
                "rich-text min-w-0 flex-1",
                todo.done ? "text-ink-mute line-through" : "text-ink"
              )}
              title={todoPreview(todo.text)}
              dangerouslySetInnerHTML={{ __html: sanitizeTodoHtml(todo.text) }}
            ></div>
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
              v ? patch.mutate({ due_date: v }) : patch.mutate({ clear_due_date: true })
            }
          />
          <ThreadSelect
            value={todo.thread_id}
            threads={threads}
            onChange={(v) =>
              v ? patch.mutate({ thread_id: v }) : patch.mutate({ clear_thread: true })
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

function RichTextComposer({
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    const html = sanitizeTodoHtml(value);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    if (autoFocus) {
      requestAnimationFrame(() => {
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    }
  }, [autoFocus, value]);

  const runCommand = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command);
    const next = editorRef.current?.innerHTML ?? "";
    lastEmittedRef.current = next;
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-line bg-canvas-raised/40 p-2">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <EditorButton label="B" title="加粗" onClick={() => runCommand("bold")} />
        <EditorButton label="I" title="斜体" onClick={() => runCommand("italic")} />
        <EditorButton label="U" title="下划线" onClick={() => runCommand("underline")} />
        <EditorButton label="S" title="删除线" onClick={() => runCommand("strikeThrough")} />
        <span className="mx-1 h-4 w-px bg-line" />
        <EditorButton
          label="•"
          title="无序列表"
          onClick={() => runCommand("insertUnorderedList")}
        />
        <EditorButton label="1." title="有序列表" onClick={() => runCommand("insertOrderedList")} />
        <span className="ml-auto mono-meta">⌘ Enter 保存</span>
      </div>
      <div
        ref={editorRef}
        className="rich-text-editor"
        contentEditable
        data-placeholder={placeholder}
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={(e) => {
          lastEmittedRef.current = e.currentTarget.innerHTML;
          onChange(e.currentTarget.innerHTML);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit?.();
          }
          if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
    </div>
  );
}

function EditorButton({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-line bg-canvas-sunken px-2 text-xs font-semibold text-ink-soft transition hover:border-accent/50 hover:text-accent"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
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
    <div className={clsx("chip", overdue && "chip-stop")}>
      <span className="font-mono text-[10px]">DUE</span>
      <DateTimeField
        value={value}
        onChange={onChange}
        className="min-w-[8.5rem]"
        buttonClassName="border-0 bg-transparent px-0 py-0 font-mono text-[11px] shadow-none hover:border-transparent"
        popoverClassName="-left-16"
      />
    </div>
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
