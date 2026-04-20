import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Note, NotePatch } from "@/lib/types";
import { dateKey, formatDateTime, toDateTimeInputValue } from "@/lib/periods";

export default function Notes() {
  const qc = useQueryClient();
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: api.notes.list,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && notes.length > 0) {
      setSelectedId(notes[0].id);
    }
    if (selectedId && !notes.find((n) => n.id === selectedId)) {
      setSelectedId(notes[0]?.id ?? null);
    }
  }, [notes, selectedId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const create = useMutation({
    mutationFn: api.notes.create,
    onSuccess: (n) => {
      invalidate();
      setSelectedId(n.id);
    },
  });

  const byDay = useMemo(() => {
    const groups = new Map<string, Note[]>();
    for (const n of notes) {
      const key = dateKey(n.day);
      const arr = groups.get(key) ?? [];
      arr.push(n);
      groups.set(key, arr);
    }
    return Array.from(groups.entries());
  }, [notes]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-10 py-10">
      <header className="mb-6 flex items-end justify-between gap-6">
        <div>
          <div className="eyebrow">NOTES</div>
          <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
            记事
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            轻量速记，可随时晋升为证据或挂到线程。
          </p>
        </div>
        <button
          className="btn btn-accent"
          onClick={() =>
            create.mutate({
              title: "",
              body_md: "",
            })
          }
          disabled={create.isPending}
        >
          ＋ 新建
        </button>
      </header>

      {isLoading ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          加载中…
        </div>
      ) : notes.length === 0 ? (
        <div className="panel p-12 text-center text-sm text-ink-mute">
          空如新纸。点「＋ 新建」写下第一条。
        </div>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-5">
          {/* Sidebar */}
          <aside className="panel max-h-[72vh] overflow-y-auto p-2">
            {byDay.map(([day, dayNotes]) => (
              <div key={day} className="mb-3 last:mb-1">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="eyebrow text-[9px]">
                    {formatDateTime(day, { includeTime: false, withYear: false })}
                  </span>
                  <span className="h-px flex-1 bg-line" />
                  <span className="mono-meta text-[10px]">
                    {dayNotes.length}
                  </span>
                </div>
                <ul>
                  {dayNotes.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => setSelectedId(n.id)}
                        className={clsx(
                          "block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition",
                          selectedId === n.id
                            ? "bg-accent/10 text-accent"
                            : "text-ink-soft hover:bg-canvas-contrast hover:text-ink"
                        )}
                      >
                        {n.title.trim() || preview(n.body_md) || "未命名"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          {/* Editor */}
          <section className="panel p-5">
            {selected ? (
              <NoteEditor
                note={selected}
                onChanged={invalidate}
                onDeleted={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-mute">
                选择一条笔记开始编辑。
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function preview(md: string): string {
  return md.replace(/[#*_`>-]/g, "").trim().split("\n")[0].slice(0, 40);
}

function NoteEditor({
  note,
  onChanged,
  onDeleted,
}: {
  note: Note;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body_md);
  const [day, setDay] = useState(note.day);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.body_md);
    setDay(note.day);
    setSavedAt(null);
  }, [note.id, note.title, note.body_md, note.day]);

  const patch = useMutation({
    mutationFn: (p: NotePatch) => api.notes.patch(note.id, p),
    onSuccess: () => {
      setSavedAt(new Date().toLocaleTimeString());
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.notes.remove(note.id),
    onSuccess: () => {
      onDeleted();
      onChanged();
    },
  });

  const dirty =
    title !== note.title || body !== note.body_md || day !== note.day;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      patch.mutate({ title, body_md: body, day });
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, day, dirty]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（可留空）"
          className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-lg font-semibold text-ink outline-none hover:border-line focus:border-accent/60"
        />
        <input
          type="datetime-local"
          value={toDateTimeInputValue(day)}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md border border-line bg-canvas-sunken/70 px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
        />
        <button
          className="btn btn-ghost text-xs text-signal-stop hover:!bg-signal-stop/10 hover:!text-signal-stop"
          onClick={() => {
            if (window.confirm("删除这条笔记？")) remove.mutate();
          }}
        >
          删除
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="支持 Markdown。# 标题 / - 列表 / **加粗** / `code`"
        className="min-h-[45vh] flex-1 resize-y rounded-lg border border-line bg-canvas-sunken/60 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none transition focus:border-accent/50 focus:bg-canvas-raised"
      />
      <div className="flex items-center justify-between mono-meta">
        <span className="flex items-center gap-2">
          {patch.isPending ? (
            <>
              <span className="dot-pulse" />
              <span>保存中…</span>
            </>
          ) : dirty ? (
            <>
              <span className="dot dot-hold" />
              <span>有未保存改动</span>
            </>
          ) : savedAt ? (
            <>
              <span className="dot dot-go" />
              <span>已保存 · {savedAt}</span>
            </>
          ) : (
            <>
              <span className="dot dot-mute" />
              <span>
                上次更新 {note.updated_at.slice(0, 16).replace("T", " ")}
              </span>
            </>
          )}
        </span>
        <span>{body.length} 字符</span>
      </div>
    </div>
  );
}
