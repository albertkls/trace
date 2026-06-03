import { useEffect, useState } from "react";
import Modal from "./Modal";

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["⌘", "K"], description: "打开搜索面板" },
  { keys: ["⌘", "N"], description: "快速记录 (QuickCapture)" },
  { keys: ["1"], description: "跳转：今日" },
  { keys: ["2"], description: "跳转：收件箱" },
  { keys: ["3"], description: "跳转：项目" },
  { keys: ["4"], description: "跳转：工作线" },
  { keys: ["5"], description: "跳转：时间线" },
  { keys: ["6"], description: "跳转：待办" },
  { keys: ["7"], description: "跳转：笔记" },
  { keys: ["8"], description: "跳转：报告" },
  { keys: ["9"], description: "跳转：设置" },
  { keys: ["?"], description: "显示本快捷键面板" },
  { keys: ["Esc"], description: "关闭弹窗 / 取消选择" },
];

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="KEYBOARD SHORTCUTS"
      maxWidth="max-w-lg"
    >
      <div className="px-5 py-4">
        <ul className="divide-y divide-line/50">
          {SHORTCUTS.map((s, i) => (
            <li key={i} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-ink-soft">{s.description}</span>
              <div className="flex gap-1">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="rounded border border-line bg-canvas-sunken px-2 py-0.5 font-mono text-xs text-ink"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-mute">
          提示：按{" "}
          <kbd className="rounded border border-line bg-canvas-sunken px-1.5 py-0.5 font-mono">
            ?
          </kbd>{" "}
          随时打开/关闭本面板
        </p>
      </div>
    </Modal>
  );
}
