import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { isPywebviewDesktop } from "@/lib/appInfo";
import type { UpdateInfo } from "@/lib/types";

const DISMISS_PREFIX = "trace.update.dismissed.";

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UpdatePrompt() {
  const navigate = useNavigate();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDesktop = isPywebviewDesktop();

  useEffect(() => {
    if (!isDesktop) return;
    const timer = window.setTimeout(() => {
      setChecking(true);
      api.updater
        .check()
        .then((info) => {
          const dismissed = window.localStorage.getItem(
            `${DISMISS_PREFIX}${info.latest_version}`
          );
          if (info.update_available && !dismissed) {
            setUpdateInfo(info);
          }
          setError(null);
        })
        .catch(() => {
          // Startup update checks should stay quiet; Settings exposes the error.
        })
        .finally(() => setChecking(false));
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [isDesktop]);

  if (!isDesktop || !updateInfo?.update_available) return null;

  const dismiss = () => {
    window.localStorage.setItem(
      `${DISMISS_PREFIX}${updateInfo.latest_version}`,
      new Date().toISOString()
    );
    setUpdateInfo(null);
  };

  const downloadAndInstall = async () => {
    if (!updateInfo.dmg_url) {
      setError("这个 Release 没有可安装的 macOS DMG。");
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const { dmg_path } = await api.updater.download(
        updateInfo.dmg_url,
        updateInfo.dmg_sha256
      );
      setDownloading(false);
      setInstalling(true);
      await api.updater.apply(dmg_path);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setDownloading(false);
      setInstalling(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-accent/35 bg-canvas-raised p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2 w-2 rounded-full bg-accent shadow-[0_0_16px_rgba(94,230,197,0.8)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-ink">
              Trace v{updateInfo.latest_version} 可用
            </div>
            {checking && <span className="mono-meta">CHECK</span>}
          </div>
          <div className="mt-1 mono-meta">
            {updateInfo.published_at?.slice(0, 10) || "GitHub Release"}
            {updateInfo.dmg_size ? ` · ${formatFileSize(updateInfo.dmg_size)}` : ""}
          </div>
          {updateInfo.changelog && (
            <div className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-soft">
              {updateInfo.changelog}
            </div>
          )}
          {installing ? (
            <div className="mt-3 text-sm text-accent">正在安装，应用即将重启…</div>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <button
                className="btn btn-accent flex-1 justify-center"
                onClick={downloadAndInstall}
                disabled={downloading}
              >
                {downloading ? "下载中…" : "下载并安装"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setUpdateInfo(null);
                  navigate("/settings");
                }}
              >
                详情
              </button>
              <button className="btn btn-ghost" onClick={dismiss}>
                稍后
              </button>
            </div>
          )}
          {error && (
            <div className="mt-3 rounded-lg border border-signal-stop/40 bg-signal-stop/10 px-3 py-2 text-xs text-signal-stop">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
