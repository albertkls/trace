/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "rgb(var(--color-canvas) / <alpha-value>)",
          raised: "rgb(var(--color-canvas-raised) / <alpha-value>)",
          sunken: "rgb(var(--color-canvas-sunken) / <alpha-value>)",
          contrast: "rgb(var(--color-canvas-contrast) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--color-ink) / <alpha-value>)",
          soft: "rgb(var(--color-ink-soft) / <alpha-value>)",
          mute: "rgb(var(--color-ink-mute) / <alpha-value>)",
          faint: "rgb(var(--color-ink-faint) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          soft: "rgb(var(--color-accent-soft) / <alpha-value>)",
          ink: "rgb(var(--color-accent-ink) / <alpha-value>)",
        },
        iris: {
          DEFAULT: "rgb(var(--color-iris) / <alpha-value>)",
          soft: "rgb(var(--color-iris-soft) / <alpha-value>)",
          ink: "rgb(var(--color-iris-ink) / <alpha-value>)",
        },
        signal: {
          go: "rgb(var(--color-signal-go) / <alpha-value>)",
          hold: "rgb(var(--color-signal-hold) / <alpha-value>)",
          stop: "rgb(var(--color-signal-stop) / <alpha-value>)",
          mute: "rgb(var(--color-signal-mute) / <alpha-value>)",
          info: "rgb(var(--color-signal-info) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--color-line) / 0.08)",
          strong: "rgb(var(--color-line-strong) / 0.18)",
        },
      },
      fontFamily: {
        display: [
          '"Geist"',
          '"Inter"',
          '"SF Pro Display"',
          '"PingFang SC"',
          "system-ui",
          "sans-serif",
        ],
        sans: [
          '"Geist"',
          '"Inter"',
          '"SF Pro Text"',
          '"PingFang SC"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"Geist Mono"',
          '"JetBrains Mono"',
          '"SF Mono"',
          '"Menlo"',
          "ui-monospace",
          "monospace",
        ],
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        chip: "var(--shadow-chip)",
        glow: "var(--shadow-glow)",
        ring: "var(--shadow-ring)",
      },
      borderRadius: {
        pill: "9999px",
      },
      keyframes: {
        pulse_ring: {
          "0%": { boxShadow: "0 0 0 0 rgba(94,230,197,0.55)" },
          "70%": { boxShadow: "0 0 0 6px rgba(94,230,197,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(94,230,197,0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-ring": "pulse_ring 1.8s infinite",
        shimmer: "shimmer 2.6s linear infinite",
      },
    },
  },
  plugins: [],
};
