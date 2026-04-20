import type { ReportAudience } from "./types";

/** Format a Date as YYYY-MM-DD (local wall-clock). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a Date as YYYY-MM-DDTHH:MM (local wall-clock). */
export function toISODateTimeMinute(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hour}:${minute}`;
}

export function parseDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const minuteMatch =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (minuteMatch) {
    const [, y, m, d, hh, mm, ss] = minuteMatch;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss || "0"),
      0
    );
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const parsed = parseDateTime(value);
  return parsed ? toISODateTimeMinute(parsed) : value.slice(0, 16);
}

export function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function formatDateTime(
  value: string | null | undefined,
  opts: { fallback?: string; withYear?: boolean; includeTime?: boolean } = {}
): string {
  const { fallback = "—", withYear = true } = opts;
  const parsed = parseDateTime(value);
  if (!parsed) return fallback;
  const includeTime =
    opts.includeTime ?? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value ?? "");
  const localeOpts: Intl.DateTimeFormatOptions = includeTime
    ? {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }
    : {
        month: "2-digit",
        day: "2-digit",
      };
  if (withYear) localeOpts.year = "numeric";
  return parsed.toLocaleString("zh-CN", localeOpts);
}

export function formatRange(start: string, end: string): string {
  return `${formatDateTime(start)} — ${formatDateTime(end)}`;
}

/** Zero out time, return a fresh Date at local midnight. */
function atLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** ISO week starts on Monday. Returns local midnight Monday of the week containing `ref`. */
export function startOfISOWeek(ref: Date): Date {
  const d = atLocalMidnight(ref);
  const dow = d.getDay(); // 0=Sun ... 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

/** ISO week label like "2026-W16" for the week containing `ref`. */
export function isoWeekLabel(ref: Date): string {
  // ISO week number: shift to Thursday of that week, then count.
  const d = startOfISOWeek(ref);
  const thu = new Date(d);
  thu.setDate(d.getDate() + 3);
  const year = thu.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((+thu - +jan1) / 86400000);
  const week = Math.floor(days / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export type PeriodPreset = {
  key: "this_week" | "last_week" | "this_month" | "last_month" | "custom";
  label: string;
  range: () => { start: string; end: string } | null;
};

export const PRESETS: PeriodPreset[] = [
  {
    key: "this_week",
    label: "本周",
    range: () => {
      const mon = startOfISOWeek(new Date());
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sun.setHours(23, 59, 0, 0);
      return { start: toISODateTimeMinute(mon), end: toISODateTimeMinute(sun) };
    },
  },
  {
    key: "last_week",
    label: "上周",
    range: () => {
      const mon = startOfISOWeek(new Date());
      mon.setDate(mon.getDate() - 7);
      mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sun.setHours(23, 59, 0, 0);
      return { start: toISODateTimeMinute(mon), end: toISODateTimeMinute(sun) };
    },
  },
  {
    key: "this_month",
    label: "本月",
    range: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      first.setHours(0, 0, 0, 0);
      last.setHours(23, 59, 0, 0);
      return {
        start: toISODateTimeMinute(first),
        end: toISODateTimeMinute(last),
      };
    },
  },
  {
    key: "last_month",
    label: "上月",
    range: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      first.setHours(0, 0, 0, 0);
      last.setHours(23, 59, 0, 0);
      return {
        start: toISODateTimeMinute(first),
        end: toISODateTimeMinute(last),
      };
    },
  },
  { key: "custom", label: "自定义", range: () => null },
];

export const AUDIENCE_OPTIONS: { value: ReportAudience; label: string; hint: string }[] = [
  { value: "boss", label: "向上汇报", hint: "突出结果与里程碑" },
  { value: "internal", label: "部门内同步", hint: "横向同事看得懂的进展" },
  { value: "1on1", label: "1:1 对齐", hint: "阻塞 / 协同诉求" },
  { value: "retro", label: "复盘", hint: "得失与学到的事" },
  { value: "self", label: "自我记录", hint: "留给未来的自己" },
];

export const AUDIENCE_LABEL: Record<ReportAudience, string> = Object.fromEntries(
  AUDIENCE_OPTIONS.map((o) => [o.value, o.label])
) as Record<ReportAudience, string>;
