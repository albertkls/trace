/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#0A0C12",
          raised: "#10131B",
          sunken: "#06080D",
          contrast: "#161A25",
        },
        ink: {
          DEFAULT: "#E8ECF4",
          soft: "#B2BAC9",
          mute: "#6C768A",
          faint: "#3E4758",
        },
        accent: {
          DEFAULT: "#5EE6C5",
          soft: "#1F8B78",
          ink: "#041612",
        },
        iris: {
          DEFAULT: "#8B95FF",
          soft: "#313866",
          ink: "#0A0A1E",
        },
        signal: {
          go: "#4ADE80",
          hold: "#F5C451",
          stop: "#FF6B6B",
          mute: "#6C768A",
          info: "#60A5FA",
        },
        line: {
          DEFAULT: "rgba(200, 210, 230, 0.08)",
          strong: "rgba(200, 210, 230, 0.18)",
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
        soft: "0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 40px rgba(0,0,0,0.45)",
        chip: "inset 0 0 0 1px rgba(200,210,230,0.10)",
        glow: "0 0 0 1px rgba(94,230,197,0.45), 0 0 20px rgba(94,230,197,0.25)",
        ring: "0 0 0 2px rgba(139,149,255,0.45)",
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
