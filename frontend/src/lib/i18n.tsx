import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Locale = "zh" | "en";

const STORAGE_KEY = "trace_locale";

const translations: Record<string, Record<Locale, string>> = {
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.save": { zh: "保存", en: "Save" },
  "common.confirm": { zh: "确认", en: "Confirm" },
  "common.delete": { zh: "删除", en: "Delete" },
  "common.edit": { zh: "编辑", en: "Edit" },
  "common.create": { zh: "创建", en: "Create" },
  "common.search": { zh: "搜索", en: "Search" },
  "common.loading": { zh: "加载中…", en: "Loading…" },
  "common.retry": { zh: "重试", en: "Retry" },
  "common.close": { zh: "关闭", en: "Close" },
  "common.error": { zh: "出错了", en: "Error" },
  "common.success": { zh: "成功", en: "Success" },
  "nav.home": { zh: "首页", en: "Home" },
  "nav.inbox": { zh: "收件箱", en: "Inbox" },
  "nav.projects": { zh: "项目", en: "Projects" },
  "nav.threads": { zh: "工作线", en: "Threads" },
  "nav.notes": { zh: "笔记", en: "Notes" },
  "nav.todos": { zh: "待办", en: "Todos" },
  "nav.timeline": { zh: "时间线", en: "Timeline" },
  "nav.reports": { zh: "报告", en: "Reports" },
  "nav.settings": { zh: "设置", en: "Settings" },
  "toast.network_error": { zh: "网络连接失败，请检查网络", en: "Network error, please check your connection" },
  "toast.unauthorized": { zh: "无权限操作，请检查设置", en: "Unauthorized, please check settings" },
  "toast.rate_limit": { zh: "请求过于频繁，请稍后再试", en: "Too many requests, please try again later" },
  "toast.server_error": { zh: "服务器错误，请稍后再试", en: "Server error, please try again later" },
  "toast.save_success": { zh: "保存成功", en: "Saved successfully" },
  "toast.delete_success": { zh: "删除成功", en: "Deleted successfully" },
  "toast.create_success": { zh: "创建成功", en: "Created successfully" },
};

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;
  return "zh";
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale === "zh" ? "zh-CN" : "en";
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const entry = translations[key];
      if (entry) {
        return entry[locale];
      }
      return fallback ?? key;
    },
    [locale]
  );

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
