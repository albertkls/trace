import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  formatDateTime,
  parseDateTime,
  toISODateTimeMinute,
} from "@/lib/periods";

type Props = {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function startOfCalendarMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function withTime(date: Date, source: Date): Date {
  const next = new Date(date);
  next.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return next;
}

function presetAt(dayOffset: number, hour: number, minute = 0): Date {
  const next = new Date();
  next.setDate(next.getDate() + dayOffset);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function normalizeDraft(value: string | null | undefined): Date {
  return parseDateTime(value) ?? new Date();
}

function displayValue(value: string | null | undefined, placeholder: string): string {
  if (!value) return placeholder;
  const parsed = parseDateTime(value);
  if (!parsed) return value;
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(parsed);
  const time = parsed.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatDateTime(value, { includeTime: false })} ${weekday} ${time}`;
}

export default function DateTimeField({
  value,
  onChange,
  disabled = false,
  clearable = true,
  placeholder = "选择时间",
  className,
  buttonClassName,
  popoverClassName,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => normalizeDraft(value));
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfCalendarMonth(normalizeDraft(value)));

  useEffect(() => {
    if (!open) return;
    const next = normalizeDraft(value);
    setDraft(next);
    setViewMonth(startOfCalendarMonth(next));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const days = useMemo(() => {
    const first = startOfCalendarMonth(viewMonth);
    const mondayFirstIndex = (first.getDay() + 6) % 7;
    const start = addDays(first, -mondayFirstIndex);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [viewMonth]);

  const commit = (next = draft) => {
    onChange(toISODateTimeMinute(next));
    setOpen(false);
  };

  const setTimePart = (part: "hour" | "minute", raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next = new Date(draft);
    if (part === "hour") next.setHours(clamp(n, 0, 23));
    if (part === "minute") next.setMinutes(clamp(n, 0, 59));
    next.setSeconds(0, 0);
    setDraft(next);
  };

  const moveDraftDay = (daysToMove: number) => {
    const next = addDays(draft, daysToMove);
    setDraft(next);
    setViewMonth(startOfCalendarMonth(next));
  };

  return (
    <div
      ref={rootRef}
      className={clsx("relative inline-block min-w-[11rem]", className)}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
        }
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveDraftDay(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveDraftDay(1);
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveDraftDay(-7);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveDraftDay(7);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={clsx(
          "inline-flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-canvas-sunken/70 px-3 py-1.5 text-left text-xs text-ink outline-none transition hover:border-accent/40 focus:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50",
          buttonClassName
        )}
      >
        <span className={clsx("min-w-0 truncate", !value && "text-ink-mute")}>
          {displayValue(value, placeholder)}
        </span>
        <span className="text-ink-mute">⌄</span>
      </button>

      {open && (
        <div
          className={clsx(
            "panel absolute left-0 top-full z-50 mt-2 w-[min(42rem,calc(100vw-3rem))] p-3 shadow-soft",
            popoverClassName
          )}
        >
          <div className="grid gap-3 md:grid-cols-[8.5rem_minmax(18rem,1fr)_6.5rem]">
            <div className="panel-sunken space-y-2 p-3">
              <div className="text-xs font-semibold text-ink">快捷时间</div>
              {[
                ["现在", new Date()],
                ["今天 09:00", presetAt(0, 9)],
                ["今天 18:00", presetAt(0, 18)],
                ["明天 09:00", presetAt(1, 9)],
              ].map(([label, next]) => (
                <button
                  key={label as string}
                  type="button"
                  className="chip w-full justify-center"
                  onClick={() => commit(next as Date)}
                >
                  {label as string}
                </button>
              ))}
              {clearable && (
                <button
                  type="button"
                  className="chip w-full justify-center text-ink-mute hover:text-signal-stop"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  清除时间
                </button>
              )}
            </div>

            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="font-display text-lg font-semibold text-ink">
                  {viewMonth.getFullYear()} 年 {viewMonth.getMonth() + 1} 月
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() =>
                      setViewMonth(
                        new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
                      )
                    }
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() => {
                      const now = new Date();
                      setDraft(withTime(now, draft));
                      setViewMonth(startOfCalendarMonth(now));
                    }}
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() =>
                      setViewMonth(
                        new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
                      )
                    }
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 border-b border-line pb-2 text-center text-[11px] font-semibold text-ink-mute">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday}>{weekday}</div>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const active = sameDay(day, draft);
                  const muted = day.getMonth() !== viewMonth.getMonth();
                  const today = sameDay(day, new Date());
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      className={clsx(
                        "aspect-square rounded-lg text-sm transition hover:bg-canvas-contrast",
                        active && "bg-accent/15 text-accent shadow-glow",
                        !active && muted && "text-ink-faint",
                        !active && !muted && "text-ink",
                        today && !active && "ring-1 ring-accent/30"
                      )}
                      onClick={() => {
                        const next = withTime(day, draft);
                        setDraft(next);
                        setViewMonth(startOfCalendarMonth(next));
                      }}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-line md:border-l md:pl-3">
              <div className="text-xs font-semibold text-ink">具体时间</div>
              <label className="mt-3 block">
                <span className="mono-meta">小时</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={String(draft.getHours()).padStart(2, "0")}
                  onChange={(event) => setTimePart("hour", event.target.value)}
                  className="input mt-1 !py-1.5 text-center font-mono"
                />
              </label>
              <label className="mt-3 block">
                <span className="mono-meta">分钟</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={String(draft.getMinutes()).padStart(2, "0")}
                  onChange={(event) => setTimePart("minute", event.target.value)}
                  className="input mt-1 !py-1.5 text-center font-mono"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  className={clsx("chip justify-center", draft.getHours() < 12 && "chip-accent")}
                  onClick={() => {
                    const next = new Date(draft);
                    if (next.getHours() >= 12) next.setHours(next.getHours() - 12);
                    setDraft(next);
                  }}
                >
                  AM
                </button>
                <button
                  type="button"
                  className={clsx("chip justify-center", draft.getHours() >= 12 && "chip-accent")}
                  onClick={() => {
                    const next = new Date(draft);
                    if (next.getHours() < 12) next.setHours(next.getHours() + 12);
                    setDraft(next);
                  }}
                >
                  PM
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="text-xs text-ink-mute">
              {formatDateTime(toISODateTimeMinute(draft), { includeTime: true })}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost text-xs" onClick={() => setOpen(false)}>
                取消
              </button>
              <button type="button" className="btn btn-accent text-xs" onClick={() => commit()}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
