import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type {
  EvidenceRef,
  OutlineNode,
  Report,
  ReportAudience,
  RewriteOp,
  RewriteRequest,
} from "@/lib/types";
import {
  AUDIENCE_LABEL,
  AUDIENCE_OPTIONS,
  toDateTimeInputValue,
} from "@/lib/periods";
import { mdToHtmlDoc } from "@/lib/markdown";
import { copyPlain, copyRich, downloadFile, safeFilename } from "@/lib/clipboard";
import { CategoryChip } from "@/components/EvidenceChip";

const REWRITE_LABEL: Record<RewriteOp, string> = {
  continue: "续写下周计划",
  compress: "压缩到精简版",
  retone: "换成其他口吻",
  custom: "自定义指令",
};

type RewriteState = {
  op: RewriteOp;
  title: string;
  params: Omit<RewriteRequest, "op" | "profile_id">;
  text: string;
  mode: "append" | "replace";
  status: "pending" | "streaming" | "done" | "error";
  message?: string;
};

function slugifyOutline(body: string): OutlineNode[] {
  const lines = body.split(/\r?\n/);
  const nodes: OutlineNode[] = [];
  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length as 1 | 2 | 3;
    const title = m[2].trim();
    nodes.push({
      id: `h-${nodes.length}-${title.slice(0, 20)}`,
      title,
      level,
    });
  }
  return nodes;
}

export default function ReportComposer() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", id],
    queryFn: () => api.reports.get(id),
    enabled: !!id,
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [showPeriodEditor, setShowPeriodEditor] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [composeNote, setComposeNote] = useState("");
  const [rewrite, setRewrite] = useState<RewriteState | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const evidencePanelRef = useRef<HTMLUListElement | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ["llm-profiles"],
    queryFn: api.llm.list,
  });

  useEffect(() => {
    if (!report) return;
    setTitle(report.title);
    setBody(report.body_md ?? "");
    setDirty(false);
    setSavedAt(report.updated_at);
  }, [report?.id]);

  const outline = useMemo(() => slugifyOutline(body), [body]);

  const save = useMutation({
    mutationFn: () =>
      api.reports.patch(id, { title, body_md: body, outline }),
    onSuccess: (r) => {
      setDirty(false);
      setSavedAt(r.updated_at);
      qc.invalidateQueries({ queryKey: ["report", id] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const finalize = useMutation({
    mutationFn: () =>
      api.reports.patch(id, { title, body_md: body, outline, status: "final" }),
    onSuccess: (r) => {
      setDirty(false);
      setSavedAt(r.updated_at);
      qc.invalidateQueries({ queryKey: ["report", id] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const updateMeta = useMutation({
    mutationFn: (patch: {
      period_start?: string;
      period_end?: string;
      period_label?: string;
      audience?: ReportAudience;
    }) => api.reports.patch(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report", id] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      setShowPeriodEditor(false);
    },
    onError: (e: Error) => flashToast(`更新周期失败：${e.message}`),
  });

  const remove = useMutation({
    mutationFn: () => api.reports.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      navigate("/reports");
    },
    onError: (e: Error) => flashToast(`删除失败：${e.message}`),
  });

  const startRewrite = async (
    op: RewriteOp,
    params: Omit<RewriteRequest, "op" | "profile_id"> = {},
    title?: string
  ) => {
    const initial: RewriteState = {
      op,
      title: title || REWRITE_LABEL[op],
      params,
      text: "",
      mode: op === "continue" ? "append" : "replace",
      status: "streaming",
    };
    setRewrite(initial);
    try {
      let accum = "";
      for await (const chunk of api.reports.rewrite(id, {
        op,
        profile_id: selectedProfileId || undefined,
        ...params,
      })) {
        if (chunk.type === "delta" && chunk.text) {
          accum += chunk.text;
          setRewrite((prev) =>
            prev ? { ...prev, text: accum } : prev
          );
        } else if (chunk.type === "done") {
          setRewrite((prev) =>
            prev
              ? {
                  ...prev,
                  text: chunk.text || accum,
                  mode: chunk.mode || prev.mode,
                  status: "done",
                }
              : prev
          );
        } else if (chunk.type === "error") {
          setRewrite((prev) =>
            prev
              ? { ...prev, status: "error", message: chunk.message }
              : prev
          );
        }
      }
    } catch (e) {
      setRewrite((prev) =>
        prev ? { ...prev, status: "error", message: String(e) } : prev
      );
    }
  };

  const applyRewrite = () => {
    if (!rewrite || rewrite.status !== "done" || !rewrite.text) {
      setRewrite(null);
      return;
    }
    const next =
      rewrite.mode === "append"
        ? (body ? body.trimEnd() + "\n\n" : "") + rewrite.text
        : rewrite.text;
    setBody(next);
    setDirty(true);
    setRewrite(null);
  };

  const flashToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((current) => (current === msg ? null : current));
    }, 2000);
  };

  const exportMarkdown = async () => {
    const md = buildExportMarkdown(title, body);
    try {
      await copyPlain(md);
      flashToast("已复制 Markdown");
    } catch (e) {
      alert(`复制失败：${e}`);
    }
    setExportOpen(false);
  };

  const exportRich = async () => {
    const md = buildExportMarkdown(title, body);
    const html = mdToHtmlDoc(md, title);
    try {
      await copyRich({ html, text: md });
      flashToast("已复制为富文本 · 可直接粘贴到飞书 / Notion");
    } catch (e) {
      alert(`复制失败：${e}`);
    }
    setExportOpen(false);
  };

  const exportDownload = () => {
    const md = buildExportMarkdown(title, body);
    const fname = `${safeFilename(title || report?.period_label || "report")}.md`;
    downloadFile(fname, md);
    flashToast(`已下载 ${fname}`);
    setExportOpen(false);
  };

  const doCompose = async () => {
    setComposing(true);
    setShowComposeModal(false);
    let draft = "";
    try {
      for await (const chunk of api.reports.compose(id, {
        profile_id: selectedProfileId || undefined,
        note: composeNote || undefined,
      })) {
        if (chunk.type === "delta" && chunk.text) {
          draft += chunk.text;
          setBody(draft);
        } else if (chunk.type === "done") {
          draft = chunk.body_md || draft;
          setBody(draft);
          setDirty(true);
          setSavedAt(new Date().toISOString());
          qc.invalidateQueries({ queryKey: ["report", id] });
        } else if (chunk.type === "error") {
          flashToast(`LLM 错误: ${chunk.message}`);
        }
      }
    } catch (e) {
      flashToast(`compose 失败: ${e}`);
    } finally {
      setComposing(false);
    }
  };

  // Keep hook order stable even while the report is still loading.
  useEffect(() => {
    if (activeCitation == null) return;
    const panel = evidencePanelRef.current;
    if (!panel) return;
    const card = panel.querySelector<HTMLElement>(
      `[data-citation="${activeCitation}"]`
    );
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeCitation]);

  if (!id) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-mute">
        请选择一份周报开始编辑。
      </div>
    );
  }

  if (isLoading || !report) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-mute">
        加载报告…
      </div>
    );
  }

  const refMatches = Array.from(body.matchAll(/\[(\d+)\]/g));
  const citedIndices = new Set(refMatches.map((m) => Number(m[1])));
  const citationCount = refMatches.length;
  const wordCount = body.replace(/\s+/g, "").length;

  const scrollToHeading = (idx: number) => {
    const el = textRef.current;
    if (!el) return;
    const headings = Array.from(body.matchAll(/^#{1,3}\s+.+$/gm));
    const target = headings[idx];
    if (!target || target.index === undefined) return;
    el.focus();
    el.setSelectionRange(target.index, target.index + target[0].length);
    const before = body.slice(0, target.index).split("\n").length;
    el.scrollTop = Math.max(0, (before - 2) * 22);
  };

  const insertAtCursor = (text: string) => {
    const el = textRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    setDirty(true);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  /** Find the `[n]` the caret currently sits on or right after; returns n or null. */
  const detectCitationAtCaret = () => {
    const el = textRef.current;
    if (!el) return null;
    const pos = el.selectionStart ?? 0;
    // Walk backwards up to 6 chars to find an opening bracket.
    const windowStart = Math.max(0, pos - 6);
    const slice = body.slice(windowStart, pos + 6);
    const local = pos - windowStart;
    for (const m of slice.matchAll(/\[(\d+)\]/g)) {
      if (m.index === undefined) continue;
      const s = m.index;
      const e = s + m[0].length;
      if (local >= s && local <= e) return Number(m[1]);
    }
    return null;
  };

  const onTextareaSelect = () => {
    const n = detectCitationAtCaret();
    setActiveCitation(n);
  };

  /** Move caret in the textarea to the first occurrence of `[n]` and select it. */
  const scrollBodyToCitation = (n: number) => {
    const el = textRef.current;
    if (!el) return;
    const needle = `[${n}]`;
    const idx = body.indexOf(needle);
    if (idx < 0) {
      flashToast(`正文中暂无 [${n}]，可拖拽右侧卡片插入`);
      return;
    }
    el.focus();
    el.setSelectionRange(idx, idx + needle.length);
    const lineBefore = body.slice(0, idx).split("\n").length;
    el.scrollTop = Math.max(0, (lineBefore - 3) * 22);
    setActiveCitation(n);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="relative flex items-center gap-4 border-b border-line bg-canvas-sunken/70 px-8 py-4">
        <Link
          to="/reports"
          className="text-xs text-ink-mute transition hover:text-accent"
        >
          ← 汇报
        </Link>
        <button
          type="button"
          onClick={() => setShowPeriodEditor((v) => !v)}
          className="flex items-baseline gap-3 rounded-lg px-2 py-1 transition hover:bg-canvas-sunken/60"
          title="点击编辑周期 / 视角"
        >
          <span className="chip">{report.period_label}</span>
          <span className="text-xs text-ink-mute">
            {report.period_start} — {report.period_end} ·{" "}
            {AUDIENCE_LABEL[report.audience]}
          </span>
          <span className="text-[10px] text-ink-mute">▾</span>
        </button>
        {showPeriodEditor && (
          <PeriodEditor
            report={report}
            onCancel={() => setShowPeriodEditor(false)}
            onSave={(patch) => updateMeta.mutate(patch)}
            saving={updateMeta.isPending}
          />
        )}
        <div className="ml-auto flex items-center gap-3 mono-meta">
          <span className="flex items-center gap-1.5">
            {composing ? (
              <>
                <span className="dot-pulse" />
                <span>AI 生成中…</span>
              </>
            ) : dirty ? (
              <>
                <span className="dot dot-hold" />
                <span>未保存</span>
              </>
            ) : savedAt ? (
              <>
                <span className="dot dot-go" />
                <span>
                  已保存 ·{" "}
                  {new Date(savedAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </>
            ) : (
              <span className="dot dot-mute" />
            )}
          </span>
          <span className="opacity-40">·</span>
          <span>{String(wordCount).padStart(3, "0")} 字</span>
          <span className="opacity-40">·</span>
          <span>{String(citationCount).padStart(2, "0")} 引用</span>
          <button
            className="btn btn-ghost"
            onClick={() => setShowComposeModal(true)}
            disabled={composing || !profiles.length}
          >
            {composing ? "生成中…" : "✨ AI 生成"}
          </button>
          <div className="relative">
            <button
              className="btn btn-ghost"
              onClick={() => setExportOpen((v) => !v)}
              disabled={composing}
            >
              导出 ▾
            </button>
            {exportOpen && (
              <ExportMenu
                onCopyMd={exportMarkdown}
                onCopyRich={exportRich}
                onDownload={exportDownload}
                onClose={() => setExportOpen(false)}
              />
            )}
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => save.mutate()}
            disabled={save.isPending || !dirty || composing}
          >
            {save.isPending ? "保存中…" : "保存"}
          </button>
          <button
            className="btn btn-accent"
            onClick={() => finalize.mutate()}
            disabled={finalize.isPending || composing}
          >
            {report.status === "final" ? "已定稿" : "定稿"}
          </button>
          <button
            className="btn btn-ghost text-signal-stop"
            onClick={() => {
              if (window.confirm(`删除「${report.title}」？此操作不可恢复。`)) {
                remove.mutate();
              }
            }}
            disabled={remove.isPending || composing}
            title="删除此报告"
          >
            {remove.isPending ? "删除中…" : "删除"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px]">
        <aside className="min-h-0 overflow-y-auto border-r border-line bg-canvas-sunken/60 px-5 py-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">OUTLINE</span>
            <button
              className="text-xs text-accent hover:underline"
              onClick={() => insertAtCursor("\n## 新章节\n\n")}
            >
              ＋
            </button>
          </div>
          {outline.length === 0 ? (
            <p className="text-xs text-ink-mute">
              在正文写下 <code className="kbd">##</code>{" "}
              标题，大纲会自动更新。
            </p>
          ) : (
            <ol className="space-y-1 text-sm">
              {outline.map((node, idx) => (
                <li key={node.id}>
                  <button
                    onClick={() => scrollToHeading(idx)}
                    className={clsx(
                      "w-full truncate rounded-md px-2 py-1 text-left transition hover:bg-canvas-raised",
                      node.level === 1
                        ? "font-medium text-ink"
                        : node.level === 2
                        ? "pl-4 text-ink-soft"
                        : "pl-6 text-xs text-ink-mute"
                    )}
                  >
                    {node.title}
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-8">
            <div className="mb-2 eyebrow">AUDIENCE</div>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() =>
                    report.audience !== o.value &&
                    updateMeta.mutate({ audience: o.value })
                  }
                  disabled={updateMeta.isPending}
                  className={clsx(
                    "chip cursor-pointer",
                    report.audience === o.value && "chip-accent"
                  )}
                  title={o.hint}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-12 py-10">
            <input
              className="w-full bg-transparent font-display text-3xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-faint"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              placeholder="给这份周报起个名字…"
            />
            <div className="mt-2 text-xs text-ink-mute">
              Markdown · 支持 <code className="kbd">[n]</code> 引用证据
            </div>
            <textarea
              ref={textRef}
              className="mt-6 h-[calc(100vh-280px)] w-full resize-none bg-transparent font-mono text-[14px] leading-[22px] text-ink outline-none placeholder:text-ink-faint"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setDirty(true);
              }}
              onSelect={onTextareaSelect}
              onClick={onTextareaSelect}
              onKeyUp={onTextareaSelect}
              spellCheck={false}
              placeholder="## 本周最重要的三件事&#10;&#10;1. …"
            />
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-line bg-canvas-sunken/60 px-5 py-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="eyebrow">EVIDENCE</span>
            <span className="mono-meta">
              {String(citedIndices.size).padStart(2, "0")}/
              {String(report.cited_evidence.length).padStart(2, "0")}
            </span>
          </div>

          {report.cited_evidence.length === 0 ? (
            <p className="text-xs text-ink-mute">
              还没有引用。点 <span className="chip">✨ AI 生成</span>{" "}
              会基于周期内证据起草并自动带上引用。
            </p>
          ) : (
            <ul ref={evidencePanelRef} className="space-y-2">
              {report.cited_evidence.map((evId, idx) => {
                const n = idx + 1;
                const cited = citedIndices.has(n);
                const detail = report.cited_evidence_detail?.[idx];
                return (
                  <EvidenceCard
                    key={evId}
                    n={n}
                    evId={evId}
                    detail={detail}
                    cited={cited}
                    active={activeCitation === n}
                    onInsert={() => insertAtCursor(`[${n}]`)}
                    onJump={() => scrollBodyToCitation(n)}
                  />
                );
              })}
            </ul>
          )}

          <div className="mt-6 panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="chip chip-accent">AI</span>
              <span className="text-xs text-ink-mute">改写这份正文</span>
            </div>
            <p className="text-xs leading-relaxed text-ink-soft">
              基于当前正文与周期内证据，定向生成。结果会先以预览出现，你确认后再覆盖。
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              <button
                className="btn btn-ghost justify-start text-xs"
                onClick={() =>
                  startRewrite("continue", {
                    instruction: "在正文末尾追加「下周计划」小节。",
                  })
                }
                disabled={rewrite?.status === "streaming" || composing}
                title="只生成末尾要追加的段落"
              >
                ◆ 续写下周计划
              </button>
              <button
                className="btn btn-ghost justify-start text-xs"
                onClick={() => startRewrite("compress", { target_chars: 300 })}
                disabled={rewrite?.status === "streaming" || composing || !body}
                title="整篇重写到 ~300 字"
              >
                ◆ 压缩到 300 字版本
              </button>
              <button
                className="btn btn-ghost justify-start text-xs"
                onClick={() =>
                  startRewrite(
                    "retone",
                    {
                      target_audience:
                        report.audience === "boss" ? "internal" : "boss",
                    },
                    `换成${report.audience === "boss" ? "部门同步" : "向上汇报"}口吻`
                  )
                }
                disabled={rewrite?.status === "streaming" || composing || !body}
                title="保留内容，换一种措辞"
              >
                ◆ 换成{report.audience === "boss" ? "部门同步" : "向上汇报"}口吻
              </button>
              <button
                className="btn btn-ghost justify-start text-xs text-accent"
                onClick={() =>
                  setRewrite({
                    op: "custom",
                    title: "自定义指令",
                    params: { instruction: "" },
                    text: "",
                    mode: "replace",
                    status: "pending",
                  })
                }
                disabled={rewrite?.status === "streaming" || composing}
              >
                ◆ 自定义指令…
              </button>
            </div>
          </div>
        </aside>
      </div>

      {showComposeModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="chip chip-accent">AI · COMPOSE</span>
              <span className="mono-meta">/reports/compose</span>
            </div>
            <h2 className="mb-4 font-display text-lg font-semibold">
              AI 生成周报
            </h2>

            <div className="mb-4">
              <label className="block text-xs font-medium text-ink-soft">
                使用配置
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-line bg-canvas-sunken/70 px-3 py-2 text-sm outline-none focus:border-accent/60"
                value={selectedProfileId || ""}
                onChange={(e) => setSelectedProfileId(e.target.value || null)}
              >
                <option value="">（默认配置）</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{" "}
                    {p.api_key_set ? "" : "⚠ 无 key"}
                  </option>
                ))}
              </select>
              {!profiles.some((p) =>
                selectedProfileId ? p.id === selectedProfileId : p.is_default
              ) ||
              !profiles[0]?.api_key_set ? (
                <div className="mt-1 text-[11px] text-signal-stop">
                  ⚠ 选定的配置未设置 API Key，请先在设置页配置
                </div>
              ) : null}
            </div>

            <div className="mb-6">
              <label className="block text-xs font-medium text-ink-soft">
                补充说明（可选）
              </label>
              <textarea
                className="mt-1 h-20 w-full rounded-lg border border-line bg-canvas-sunken/70 px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-accent/60"
                value={composeNote}
                onChange={(e) => setComposeNote(e.target.value)}
                placeholder="e.g. 重点强调新项目启动 / 避免篇幅过长"
              />
            </div>

            <div className="flex gap-2">
              <button
                className="btn btn-accent flex-1"
                onClick={doCompose}
                disabled={composing}
              >
                {composing ? "生成中…" : "生成"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowComposeModal(false)}
                disabled={composing}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {rewrite && (
        <RewritePanel
          state={rewrite}
          onCancel={() => setRewrite(null)}
          onChangeParams={(patch) =>
            setRewrite((prev) =>
              prev ? { ...prev, params: { ...prev.params, ...patch } } : prev
            )
          }
          onRun={() => {
            if (!rewrite) return;
            void startRewrite(rewrite.op, rewrite.params, rewrite.title);
          }}
          onApply={applyRewrite}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line bg-canvas-raised px-4 py-2 text-xs text-ink-soft shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}

function EvidenceCard({
  n,
  evId,
  detail,
  cited,
  active,
  onInsert,
  onJump,
}: {
  n: number;
  evId: string;
  detail: EvidenceRef | undefined;
  cited: boolean;
  active: boolean;
  onInsert: () => void;
  onJump: () => void;
}) {
  const text = detail?.text || evId;
  const preview = text.length > 80 ? text.slice(0, 80) + "…" : text;
  const missing = detail?.missing;

  return (
    <li
      data-citation={n}
      draggable
      onDragStart={(e) => {
        // Insert the numeric citation marker when dropped onto the textarea.
        e.dataTransfer.setData("text/plain", `[${n}]`);
        e.dataTransfer.effectAllowed = "copyLink";
      }}
      className={clsx(
        "panel p-3 text-xs transition cursor-grab active:cursor-grabbing",
        active
          ? "border-accent bg-accent/5 shadow-[0_0_0_2px_rgba(168,71,42,0.18)]"
          : cited
            ? "border-accent/40"
            : "opacity-70 hover:opacity-100",
        missing && "border-signal-stop/40"
      )}
      title={missing ? "原始证据已删除" : "拖拽到正文插入引用；点击跳转到正文中的位置"}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onJump}
          className={clsx(
            "inline-flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-pill border px-1.5 text-[11px] font-medium transition",
            active
              ? "border-accent bg-accent text-accent-ink"
              : cited
                ? "border-accent/60 bg-accent/10 text-accent"
                : "border-line bg-canvas-sunken text-ink-soft hover:border-accent hover:text-accent"
          )}
          title={`跳到正文中 [${n}] 的位置`}
        >
          {n}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-mute">
            {detail?.category && <CategoryChip category={detail.category} />}
            {detail?.event_date && <span>{detail.event_date}</span>}
            {detail?.thread_title && (
              <span className="truncate" title={detail.thread_title}>
                · {detail.thread_title}
              </span>
            )}
          </div>
          <div
            className={clsx(
              "leading-relaxed",
              missing ? "italic text-signal-stop" : "text-ink-soft"
            )}
          >
            {preview}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
            <button
              className="text-accent hover:underline"
              onClick={onInsert}
              title="把 [n] 插入到当前光标位置"
            >
              插入 [{n}]
            </button>
            {detail?.thread_id && (
              <Link
                to={`/threads/${detail.thread_id}`}
                className="text-ink-mute hover:text-accent"
                title="打开所属线程"
              >
                ↗ 线程
              </Link>
            )}
            {!cited && !missing && (
              <span className="text-ink-mute">· 未引用</span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Compose the Markdown we actually export: title as H1 if body doesn't start with one. */
function buildExportMarkdown(title: string, body: string): string {
  const trimmed = body.trimStart();
  if (!title.trim()) return trimmed;
  if (/^# /.test(trimmed)) return trimmed;
  return `# ${title.trim()}\n\n${trimmed}`;
}

function ExportMenu({
  onCopyMd,
  onCopyRich,
  onDownload,
  onClose,
}: {
  onCopyMd: () => void;
  onCopyRich: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-export-menu]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const ROWS: { key: string; label: string; hint: string; run: () => void }[] = [
    {
      key: "md",
      label: "复制 Markdown",
      hint: "粘贴到 GitHub / Obsidian / 代码块",
      run: onCopyMd,
    },
    {
      key: "rich",
      label: "复制为富文本",
      hint: "粘贴到飞书文档 / Notion / 邮件",
      run: onCopyRich,
    },
    {
      key: "dl",
      label: "下载 .md 文件",
      hint: "保存到本地做归档",
      run: onDownload,
    },
  ];

  return (
    <div
      data-export-menu
      className="absolute right-0 top-9 z-30 w-64 rounded-xl border border-line bg-canvas-raised p-1.5 shadow-soft"
    >
      <ul className="text-sm">
        {ROWS.map((r) => (
          <li key={r.key}>
            <button
              onClick={r.run}
              className="block w-full rounded-md px-3 py-2 text-left transition hover:bg-canvas-sunken"
            >
              <div className="font-medium text-ink">{r.label}</div>
              <div className="text-[11px] text-ink-mute">{r.hint}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RewritePanel({
  state,
  onCancel,
  onChangeParams,
  onRun,
  onApply,
}: {
  state: RewriteState;
  onCancel: () => void;
  onChangeParams: (patch: Partial<RewriteState["params"]>) => void;
  onRun: () => void;
  onApply: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.status !== "streaming") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.status, onCancel]);

  const canRun =
    state.op !== "custom" ||
    !!(state.params.instruction && state.params.instruction.trim());

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && state.status !== "streaming") {
          onCancel();
        }
      }}
    >
      <div className="panel flex max-h-[80vh] w-full max-w-2xl flex-col p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="chip chip-accent">AI 改写</span>
            <span className="font-display text-lg font-semibold">
              {state.title}
            </span>
            <span className="chip">
              {state.mode === "append" ? "追加" : "覆盖"}
            </span>
          </div>
          <span className="text-xs text-ink-mute">
            {state.status === "streaming"
              ? "生成中…"
              : state.status === "done"
              ? state.text
                ? "生成完成 · 预览确认后再写入正文"
                : ""
              : state.status === "error"
              ? "生成失败"
              : "编辑指令后点生成"}
          </span>
        </div>

        {state.op === "custom" && state.status === "pending" && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              指令
            </label>
            <textarea
              autoFocus
              className="h-24 w-full rounded-lg border border-line bg-canvas-sunken/70 px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-accent/60"
              value={state.params.instruction || ""}
              onChange={(e) => onChangeParams({ instruction: e.target.value })}
              placeholder={'例如："在"风险"小节里补充上周已经缓解的事项"、"把第二段改写成邮件语气"'}
            />
            <p className="mt-1 text-[11px] text-ink-mute">
              提示：指令若包含「追加」类词语，系统会自动在正文末尾追加；否则会覆盖整篇。
            </p>
          </div>
        )}

        {state.op === "compress" && state.status === "pending" && (
          <div className="mb-4 flex items-center gap-2">
            <label className="text-xs font-medium text-ink-soft">
              目标字数（约）
            </label>
            <input
              type="number"
              min={80}
              max={2000}
              step={50}
              className="w-24 rounded-lg border border-line bg-canvas-sunken/70 px-2 py-1 text-sm outline-none focus:border-accent/60"
              value={state.params.target_chars ?? 300}
              onChange={(e) =>
                onChangeParams({ target_chars: Number(e.target.value) || 300 })
              }
            />
          </div>
        )}

        {state.op === "retone" && state.status === "pending" && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              切换到
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChangeParams({ target_audience: o.value })}
                  className={clsx(
                    "chip cursor-pointer",
                    state.params.target_audience === o.value && "chip-accent"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          className={clsx(
            "min-h-[160px] flex-1 overflow-y-auto rounded-xl border px-4 py-3 font-mono text-[13px] leading-[22px] whitespace-pre-wrap",
            state.status === "error"
              ? "border-signal-stop/40 bg-signal-stop/5 text-signal-stop"
              : "border-line bg-canvas text-ink"
          )}
        >
          {state.status === "error"
            ? state.message || "未知错误"
            : state.text ||
              (state.status === "streaming" ? "…" : "点击生成开始")}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="btn"
            onClick={onCancel}
            disabled={state.status === "streaming"}
          >
            {state.status === "done" && state.text ? "丢弃" : "取消"}
          </button>
          {state.status === "pending" && (
            <button
              className="btn btn-accent"
              onClick={onRun}
              disabled={!canRun}
            >
              生成
            </button>
          )}
          {state.status === "error" && (
            <button className="btn btn-accent" onClick={onRun}>
              重试
            </button>
          )}
          {state.status === "done" && state.text && (
            <button className="btn btn-accent" onClick={onApply}>
              {state.mode === "append" ? "追加到正文" : "覆盖正文"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodEditor({
  report,
  onCancel,
  onSave,
  saving,
}: {
  report: Report;
  onCancel: () => void;
  onSave: (patch: {
    period_start?: string;
    period_end?: string;
    period_label?: string;
    audience?: ReportAudience;
  }) => void;
  saving: boolean;
}) {
  const [start, setStart] = useState(report.period_start);
  const [end, setEnd] = useState(report.period_end);
  const [label, setLabel] = useState(report.period_label);
  const [audience, setAudience] = useState<ReportAudience>(report.audience);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const valid = start && end && start <= end && label.trim();
  const labelAuto = label === report.period_label;

  return (
    <div className="panel absolute left-24 top-16 z-40 w-[380px] p-4">
      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-ink-mute">
        编辑周期 / 视角
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] text-ink-mute">开始</span>
          <input
            type="datetime-local"
            value={toDateTimeInputValue(start)}
            onChange={(e) => {
              setStart(e.target.value);
              if (labelAuto) setLabel(report.period_label);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-canvas-sunken/70 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-ink-mute">结束</span>
          <input
            type="datetime-local"
            value={toDateTimeInputValue(end)}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-canvas-sunken/70 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
          />
        </label>
      </div>

      <div className="mt-3">
        <span className="text-[11px] text-ink-mute">周期标签</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="留空会按日期自动生成"
          className="mt-1 w-full rounded-lg border border-line bg-canvas-sunken/70 px-3 py-1.5 text-sm outline-none focus:border-accent/60"
        />
      </div>

      <div className="mt-3">
        <span className="text-[11px] text-ink-mute">视角</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {AUDIENCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setAudience(o.value)}
              className={clsx(
                "chip cursor-pointer",
                audience === o.value && "chip-accent"
              )}
              title={o.hint}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {start && end && start > end && (
        <div className="mt-3 text-xs text-signal-stop">
          开始日期不能晚于结束日期
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button className="btn" onClick={onCancel} disabled={saving}>
          取消
        </button>
        <button
          className="btn btn-accent"
          onClick={() => {
            const patch: {
              period_start?: string;
              period_end?: string;
              period_label?: string;
              audience?: ReportAudience;
            } = {};
            if (start !== report.period_start) patch.period_start = start;
            if (end !== report.period_end) patch.period_end = end;
            if (label !== report.period_label) patch.period_label = label;
            if (audience !== report.audience) patch.audience = audience;
            if (Object.keys(patch).length === 0) {
              onCancel();
              return;
            }
            onSave(patch);
          }}
          disabled={!valid || saving}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
