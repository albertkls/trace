import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import { APP_VERSION, isPywebviewDesktop } from "@/lib/appInfo";
import type { LibraryScanResult, LLMProfile, LLMProtocol, ProfileInput, UpdateInfo } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

const PROTOCOLS = [
  { value: "openai-compat", label: "OpenAI 兼容协议" },
  { value: "anthropic", label: "Anthropic /v1/messages" },
];

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "moonshot", label: "Moonshot (Kimi)" },
  { value: "dashscope", label: "DashScope (通义)" },
  { value: "anthropic", label: "Anthropic" },
  { value: "ollama", label: "Ollama (本地)" },
  { value: "custom", label: "其他 / 自定义网关" },
];

const PRESET_CONFIGS: Record<string, Partial<ProfileInput>> = {
  openai: {
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    protocol: "openai-compat",
  },
  deepseek: {
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    protocol: "openai-compat",
  },
  moonshot: {
    base_url: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    protocol: "openai-compat",
  },
  dashscope: {
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-max",
    protocol: "openai-compat",
  },
  anthropic: {
    base_url: "https://api.anthropic.com",
    model: "claude-3-5-sonnet-20241022",
    protocol: "anthropic",
  },
  ollama: {
    base_url: "http://localhost:11434/v1",
    model: "llama2",
    protocol: "openai-compat",
  },
};

export default function Settings() {
  const qc = useQueryClient();
  const isDesktop = isPywebviewDesktop();
  const { activeWorkspaceId, workspaces } = useWorkspace();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Update state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    setCheckingUpdate(true);
    api.updater
      .check()
      .then((info) => {
        setUpdateInfo(info);
        setUpdateError(null);
      })
      .catch((e: Error) => setUpdateError(e.message))
      .finally(() => setCheckingUpdate(false));
  }, [isDesktop]);

  const handleCheckUpdate = () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    api.updater
      .check()
      .then((info) => {
        setUpdateInfo(info);
      })
      .catch((e: Error) => setUpdateError(e.message))
      .finally(() => setCheckingUpdate(false));
  };

  const handleDownloadAndInstall = async () => {
    if (!updateInfo?.dmg_url) return;
    setDownloading(true);
    setUpdateError(null);
    try {
      const { dmg_path } = await api.updater.download(
        updateInfo.dmg_url,
        updateInfo.dmg_sha256
      );
      setDownloading(false);
      setInstalling(true);
      await api.updater.apply(dmg_path);
      // The backend will exit the process after launching the update script.
      // Show a message in case exit is delayed.
      setUpdateInfo(null);
    } catch (e: unknown) {
      setUpdateError(e instanceof Error ? e.message : String(e));
      setDownloading(false);
      setInstalling(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const { data: libraryStatus } = useQuery({
    queryKey: ["library", activeWorkspaceId],
    queryFn: api.library.status,
  });
  const [libraryPath, setLibraryPath] = useState("");
  const [libraryResult, setLibraryResult] = useState<LibraryScanResult | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  useEffect(() => {
    setLibraryPath(libraryStatus?.path || "");
  }, [libraryStatus?.path]);

  const syncLibrary = useMutation({
    mutationFn: async () => {
      const path = libraryPath.trim();
      if (path) await api.library.configure(path);
      return api.library.scan(path || undefined);
    },
    onSuccess: (result) => {
      setLibraryError(null);
      setLibraryResult(result);
      qc.invalidateQueries({ queryKey: ["library", activeWorkspaceId] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => setLibraryError(e.message),
  });

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["llm-profiles"],
    queryFn: api.llm.list,
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [keepExistingKey, setKeepExistingKey] = useState(false);
  const [form, setForm] = useState<ProfileInput>({
    name: "",
    provider: "custom",
    protocol: "openai-compat",
    base_url: "",
    api_key: "",
    model: "",
    temperature: 0.3,
    max_tokens: 2048,
    is_default: false,
  });

  const [mutError, setMutError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.llm.create(form),
    onSuccess: () => {
      setMutError(null);
      qc.invalidateQueries({ queryKey: ["llm-profiles"] });
      resetForm();
    },
    onError: (e: Error) => setMutError(e.message),
  });

  const update = useMutation({
    mutationFn: () =>
      api.llm.update(editId!, {
        name: form.name,
        provider: form.provider,
        protocol: form.protocol,
        base_url: form.base_url,
        ...(keepExistingKey ? {} : { api_key: form.api_key }),
        model: form.model,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        is_default: form.is_default,
      }),
    onSuccess: () => {
      setMutError(null);
      qc.invalidateQueries({ queryKey: ["llm-profiles"] });
      resetForm();
    },
    onError: (e: Error) => setMutError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.llm.remove(id),
    onSuccess: (_, id) => {
      if (id === editId) resetForm();
      qc.invalidateQueries({ queryKey: ["llm-profiles"] });
    },
    onError: (e: Error) => setMutError(e.message),
  });

  const [testedId, setTestedId] = useState<string | null>(null);
  const test = useMutation({
    mutationFn: (id: string) => api.llm.test(id),
    onMutate: (id) => setTestedId(id),
  });

  const resetForm = () => {
    setEditId(null);
    setKeepExistingKey(false);
    setForm({
      name: "",
      provider: "custom",
      protocol: "openai-compat",
      base_url: "",
      api_key: "",
      model: "",
      temperature: 0.3,
      max_tokens: 2048,
      is_default: false,
    });
  };

  const onEdit = (p: LLMProfile) => {
    setEditId(p.id);
    setKeepExistingKey(p.api_key_set);
    setForm({
      name: p.name,
      provider: p.provider,
      protocol: p.protocol,
      base_url: p.base_url,
      api_key: "",
      model: p.model,
      temperature: p.temperature,
      max_tokens: p.max_tokens,
      is_default: !!p.is_default,
    });
  };

  const onPreset = (preset: string) => {
    const cfg = PRESET_CONFIGS[preset] || {};
    setForm((f) => ({ ...f, ...cfg }));
  };

  const isEditing = editId !== null;

  return (
    <div className="mx-auto max-w-3xl px-10 py-10">
      <header className="mb-10">
        <div className="eyebrow">SETTINGS</div>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-none tracking-tight">
          设置
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          管理大模型接入配置与偏好。
        </p>
      </header>

      {isDesktop && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2">
            <span className="eyebrow">APP · UPDATE</span>
          </h2>

          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-ink">当前版本</div>
                <div className="mono-meta mt-0.5">v{APP_VERSION}</div>
              </div>
              <button
                className="btn btn-ghost text-xs"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
              >
                {checkingUpdate ? "检查中…" : "检查更新"}
              </button>
            </div>

            {updateError && (
              <div className="mt-4 rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
                {updateError}
              </div>
            )}

            {installing && (
              <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
                正在安装更新，应用即将重启…
              </div>
            )}

            {downloading && (
              <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
                正在下载更新包…
              </div>
            )}

            {updateInfo?.update_available && !downloading && !installing && (
              <div className="mt-4 rounded-xl border border-line bg-canvas-raised/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="chip chip-accent">新版本</span>
                  <span className="text-sm font-medium text-ink">
                    v{updateInfo.latest_version}
                  </span>
                  {updateInfo.published_at && (
                    <span className="mono-meta">
                      · {updateInfo.published_at.slice(0, 10)}
                    </span>
                  )}
                  {updateInfo.dmg_size && (
                    <span className="mono-meta">
                      · {formatFileSize(updateInfo.dmg_size)}
                    </span>
                  )}
                </div>
                {updateInfo.changelog && (
                  <div className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-ink-soft leading-relaxed">
                    {updateInfo.changelog}
                  </div>
                )}
                <button
                  className="btn btn-accent mt-4 w-full justify-center"
                  onClick={handleDownloadAndInstall}
                >
                  下载并安装
                </button>
              </div>
            )}

            {updateInfo && !updateInfo.update_available && !checkingUpdate && !downloading && !installing && (
              <div className="mt-4 text-sm text-ink-mute">
                ✓ 已是最新版本
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2">
          <span className="eyebrow">LOCAL · LIBRARY</span>
          {activeWorkspace && <span className="chip">{activeWorkspace.name}</span>}
        </h2>

        <div className="panel p-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              className="input font-mono text-[13px]"
              value={libraryPath}
              onChange={(e) => setLibraryPath(e.target.value)}
              placeholder="/Users/albert/Documents/ObsidianVault"
            />
            <button
              className="btn btn-accent justify-center"
              disabled={syncLibrary.isPending}
              onClick={() => syncLibrary.mutate()}
            >
              {syncLibrary.isPending ? "同步中…" : "保存并同步"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={clsx("chip", libraryStatus?.exists ? "chip-go" : "chip-stop")}>
              {libraryStatus?.exists ? "路径可用" : "未挂载"}
            </span>
            <span className="mono-meta">
              {libraryStatus?.source_count ?? 0} 个本地文件
            </span>
            {libraryStatus?.last_scan && (
              <span className="mono-meta">
                上次同步 {libraryStatus.last_scan.slice(0, 16).replace("T", " ")}
              </span>
            )}
          </div>

          {libraryResult && (
            <div className="mt-4 rounded-xl border border-line bg-canvas-raised/50 px-4 py-3 text-sm text-ink-soft">
              扫描 {libraryResult.scanned} 个 Markdown：新增 {libraryResult.created}，
              更新 {libraryResult.updated}，未变化 {libraryResult.unchanged}，
              清理 {libraryResult.removed}
              {libraryResult.errors.length > 0 && `，失败 ${libraryResult.errors.length}`}
            </div>
          )}

          {libraryError && (
            <div className="mt-4 rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              {libraryError}
            </div>
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2">
          <span className="eyebrow">LLM · PROFILES</span>
          <span className="chip">{String(profiles.length).padStart(2, "0")}</span>
        </h2>

        {isLoading ? (
          <div className="text-sm text-ink-mute">加载中…</div>
        ) : profiles.length === 0 ? (
          <div className="panel p-10 text-center text-sm text-ink-mute">
            还没有配置。填写下方表单新增一个。
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={clsx(
                  "panel flex items-center justify-between gap-4 p-4 transition",
                  editId === p.id && "border-accent/50"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{p.name}</span>
                    {p.is_default && (
                      <span className="chip chip-accent">默认</span>
                    )}
                    {p.api_key_set ? (
                      <span className="chip chip-go">KEY OK</span>
                    ) : (
                      <span className="chip chip-stop">NO KEY</span>
                    )}
                  </div>
                  <div className="mt-1 mono-meta">
                    {p.provider} · {p.model} · {p.protocol}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => test.mutate(p.id)}
                    disabled={test.isPending && testedId === p.id}
                  >
                    {test.isPending && testedId === p.id ? "测试中…" : "测试"}
                  </button>
                  {testedId === p.id && test.data?.ok && (
                    <span className="chip chip-go mono-meta">
                      {test.data.latency_ms}ms
                    </span>
                  )}
                  {testedId === p.id && test.isError && (
                    <span className="chip chip-stop">失败</span>
                  )}
                  <button
                    className="btn btn-ghost text-xs"
                    onClick={() => onEdit(p)}
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-ghost text-xs text-signal-stop hover:!bg-signal-stop/10 hover:!text-signal-stop"
                    onClick={() => remove.mutate(p.id)}
                    disabled={remove.isPending}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="eyebrow">
            {isEditing ? "EDIT PROFILE" : "NEW PROFILE"}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mono-meta">名称</label>
            <input
              type="text"
              className="input mt-1"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. DeepSeek（工作）"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mono-meta">服务商</label>
              <select
                className="input mt-1"
                value={form.provider}
                onChange={(e) => {
                  const p = e.target.value;
                  setForm((f) => ({ ...f, provider: p }));
                  onPreset(p);
                }}
              >
                {PROVIDERS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    className="bg-canvas-raised"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mono-meta">协议</label>
              <select
                className="input mt-1"
                value={form.protocol}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    protocol: e.target.value as LLMProtocol,
                  }))
                }
              >
                {PROTOCOLS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    className="bg-canvas-raised"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mono-meta">Base URL</label>
            <input
              type="url"
              className="input mt-1 font-mono text-[13px]"
              value={form.base_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, base_url: e.target.value }))
              }
              placeholder="https://api.deepseek.com/v1"
            />
          </div>

          <div>
            <label className="mono-meta">API Key</label>
            <input
              type="password"
              className="input mt-1 font-mono"
              value={form.api_key}
              onChange={(e) => {
                const next = e.target.value;
                setKeepExistingKey(isEditing && next.trim() === "");
                setForm((f) => ({ ...f, api_key: next }));
              }}
              placeholder="sk-…"
            />
            {isEditing && (
              <div className="mt-1 text-xs text-ink-mute">
                {keepExistingKey
                  ? "留空会保留当前已保存的 key"
                  : "保存后会用这里的新 key 覆盖旧值"}
              </div>
            )}
          </div>

          <div>
            <label className="mono-meta">模型</label>
            <input
              type="text"
              className="input mt-1 font-mono text-[13px]"
              value={form.model}
              onChange={(e) =>
                setForm((f) => ({ ...f, model: e.target.value }))
              }
              placeholder="deepseek-chat"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mono-meta">温度（0–2）</label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                className="input mt-1 font-mono"
                value={form.temperature}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    temperature: parseFloat(e.target.value) || 0.3,
                  }))
                }
              />
            </div>

            <div>
              <label className="mono-meta">最大 token 数</label>
              <input
                type="number"
                min="100"
                step="100"
                className="input mt-1 font-mono"
                value={form.max_tokens}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    max_tokens: parseInt(e.target.value, 10) || 2048,
                  }))
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_default"
              className="h-4 w-4 accent-accent"
              checked={form.is_default}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_default: e.target.checked }))
              }
            />
            <span className="text-xs text-ink-soft">设为默认配置</span>
          </label>

          {mutError && (
            <div className="rounded-xl border border-signal-stop/40 bg-signal-stop/10 px-4 py-2 text-xs text-signal-stop">
              操作失败：{mutError}
            </div>
          )}
          <div className="flex gap-2 border-t border-line pt-4">
            <button
              className="btn btn-accent flex-1 justify-center"
              onClick={() => {
                setMutError(null);
                if (isEditing) {
                  update.mutate();
                } else {
                  create.mutate();
                }
              }}
              disabled={create.isPending || update.isPending || !form.name}
            >
              {isEditing
                ? update.isPending
                  ? "更新中…"
                  : "更新"
                : create.isPending
                ? "创建中…"
                : "创建"}
            </button>
            {isEditing && (
              <button
                className="btn btn-ghost"
                onClick={() => resetForm()}
                disabled={create.isPending || update.isPending}
              >
                取消
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
