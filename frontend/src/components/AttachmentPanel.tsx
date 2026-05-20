import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Attachment, AttachmentOwnerType } from "@/lib/types";

function formatBytes(value: number | null): string {
  if (value === null || value === undefined) return "未知大小";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function shortPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-3).join("/")}`;
}

export default function AttachmentPanel({
  ownerType,
  ownerId,
  title = "关联文件",
  compact = false,
  className,
}: {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  title?: string;
  compact?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const queryKey = ["attachments", ownerType, ownerId];
  const [path, setPath] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const [message, setMessage] = useState<string | null>(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.attachments.list(ownerType, ownerId),
    enabled: !!ownerId && expanded,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: () =>
      api.attachments.create({
        owner_type: ownerType,
        owner_id: ownerId,
        file_path: path.trim(),
        display_name: displayName.trim() || undefined,
      }),
    onSuccess: () => {
      setPath("");
      setDisplayName("");
      setAdding(false);
      setMessage(null);
      invalidate();
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.attachments.remove(id),
    onSuccess: () => {
      setMessage(null);
      invalidate();
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const open = useMutation({
    mutationFn: (id: string) => api.attachments.open(id),
    onSuccess: () => {
      setMessage(null);
      invalidate();
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const reveal = useMutation({
    mutationFn: (id: string) => api.attachments.reveal(id),
    onSuccess: () => setMessage(null),
    onError: (e: Error) => setMessage(e.message),
  });

  const submit = () => {
    if (!path.trim()) return;
    create.mutate();
  };

  return (
    <div className={clsx(compact ? "rounded-lg border border-line bg-canvas-sunken/35 p-3" : "panel p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={compact ? "text-[11px] font-medium text-ink-soft" : "eyebrow"}>
          {title}
        </div>
        <button
          className="text-xs text-accent transition hover:brightness-125"
          onClick={() => {
            setExpanded(true);
            setAdding((value) => !value);
          }}
        >
          {adding ? "收起" : "＋ 关联文件"}
        </button>
      </div>

      {message && (
        <div className="mb-3 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-1.5 text-xs text-signal-stop">
          {message}
        </div>
      )}

      {adding && (
        <div className="mb-3 space-y-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="/Users/albert/Documents/example.pdf"
            className="input w-full !py-2 text-xs"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="显示名称（可选）"
              className="input min-w-0 flex-1 !py-2 text-xs"
            />
            <button
              className="btn btn-accent text-xs"
              onClick={submit}
              disabled={!path.trim() || create.isPending}
            >
              {create.isPending ? "关联中…" : "确认"}
            </button>
          </div>
          <div className="text-[11px] leading-relaxed text-ink-mute">
            Trace 只保存路径，不移动、不复制、不修改原文件。
          </div>
        </div>
      )}

      {!expanded ? (
        <button
          className="text-xs text-ink-mute transition hover:text-accent"
          onClick={() => setExpanded(true)}
        >
          查看关联文件
        </button>
      ) : isLoading ? (
        <div className="text-sm text-ink-mute">加载关联文件…</div>
      ) : attachments.length === 0 ? (
        <div className={compact ? "text-xs text-ink-mute" : "text-sm text-ink-mute"}>
          暂无关联文件。
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              compact={compact}
              opening={open.isPending}
              revealing={reveal.isPending}
              removing={remove.isPending}
              onOpen={() => open.mutate(attachment.id)}
              onReveal={() => reveal.mutate(attachment.id)}
              onRemove={() => {
                if (window.confirm("只会移除 Trace 中的关联记录，不会删除原文件。")) {
                  remove.mutate(attachment.id);
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  compact,
  opening,
  revealing,
  removing,
  onOpen,
  onReveal,
  onRemove,
}: {
  attachment: Attachment;
  compact: boolean;
  opening: boolean;
  revealing: boolean;
  removing: boolean;
  onOpen: () => void;
  onReveal: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-lg border border-line bg-canvas-sunken/40 px-3 py-2">
      <div className="flex items-start gap-3">
        <button
          className={clsx(
            "min-w-0 flex-1 text-left",
            attachment.exists ? "text-ink hover:text-accent" : "text-ink-mute"
          )}
          title={attachment.file_path}
          onClick={onOpen}
          disabled={!attachment.exists || opening}
        >
          <div className={clsx("truncate font-medium", compact ? "text-xs" : "text-sm")}>
            {attachment.display_name}
          </div>
          <div className="mt-1 truncate text-[11px] text-ink-mute">
            {attachment.exists
              ? `${attachment.can_open ? attachment.file_kind || "file" : "仅 Finder"} · ${formatBytes(attachment.file_size)} · ${shortPath(attachment.file_path)}`
              : "文件已移动或删除"}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="rounded-md px-1.5 py-1 text-[11px] text-accent transition hover:bg-canvas-contrast disabled:opacity-40"
            onClick={onOpen}
            disabled={!attachment.exists || !attachment.can_open || opening}
            title={attachment.can_open ? "打开文件" : "此类型只能在 Finder 中显示"}
          >
            打开
          </button>
          <button
            className="rounded-md px-1.5 py-1 text-[11px] text-ink-mute transition hover:bg-canvas-contrast hover:text-accent disabled:opacity-40"
            onClick={onReveal}
            disabled={!attachment.exists || revealing}
          >
            Finder
          </button>
          <button
            className="rounded-md px-1.5 py-1 text-[11px] text-signal-stop transition hover:bg-signal-stop/10 disabled:opacity-40"
            onClick={onRemove}
            disabled={removing}
          >
            移除
          </button>
        </div>
      </div>
    </li>
  );
}
