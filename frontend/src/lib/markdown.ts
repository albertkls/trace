/**
 * Minimal Markdown → HTML renderer tuned for Trace reports.
 *
 * Scope (intentionally small; everything we expect the LLM to produce):
 * - Headings `#`, `##`, `###`
 * - Paragraphs (blank-line separated)
 * - Unordered lists (`- ` or `* `) and ordered lists (`1. `)
 * - `**bold**`, `*em*` / `_em_`, `` `code` ``
 * - Links `[text](url)` and autolinks `<https://…>`
 * - Citation markers `[n]` rendered as <sup>[n]</sup>
 * - HTML escaping so LLM output can never inject tags
 *
 * Anything fancier (tables, images, fenced code) is pass-through plain text.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a single block of inline text (already HTML-escaped? No — we escape here). */
function renderInline(src: string): string {
  let s = escapeHtml(src);

  // Links `[text](url)` — but don't eat citation markers `[1]` which have no `(`.
  s = s.replace(
    /\[([^\]]+)\]\(([^\s)]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${url}" rel="noreferrer noopener">${text}</a>`
  );

  // Autolinks <https://…>
  s = s.replace(
    /&lt;(https?:\/\/[^\s&]+)&gt;/g,
    (_m, url: string) =>
      `<a href="${url}" rel="noreferrer noopener">${url}</a>`
  );

  // Citation markers `[n]` → <sup>[n]</sup> so they stay visually tucked up.
  s = s.replace(/\[(\d+)\]/g, "<sup>[$1]</sup>");

  // Inline code `x` — greedy ok since no nesting.
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold **x** before italics, so `_**x**_` works when it ever happens.
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

  // Italics *x* or _x_ — avoid matching `**` remnants (we already did bold).
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  return s;
}

type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "blank" };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank line separator
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    // Heading
    const h = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (h) {
      blocks.push({
        kind: "h",
        level: h[1].length as 1 | 2 | 3,
        text: h[2],
      });
      i += 1;
      continue;
    }

    // Unordered list — consume contiguous bullets (allow blank line breaks later).
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph — gobble until a blank line, heading, or list
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "p", text: paraLines.join(" ") });
  }

  return blocks;
}

export function mdToHtml(md: string): string {
  const blocks = parseBlocks(md);
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "h") {
      out.push(`<h${b.level}>${renderInline(b.text)}</h${b.level}>`);
    } else if (b.kind === "p") {
      out.push(`<p>${renderInline(b.text)}</p>`);
    } else if (b.kind === "ul") {
      const items = b.items.map((t) => `<li>${renderInline(t)}</li>`).join("");
      out.push(`<ul>${items}</ul>`);
    } else if (b.kind === "ol") {
      const items = b.items.map((t) => `<li>${renderInline(t)}</li>`).join("");
      out.push(`<ol>${items}</ol>`);
    }
  }
  return out.join("\n");
}

/**
 * Wrap rendered HTML in a minimal document with inline styles, suitable for
 * paste into Feishu / Notion / Google Docs / email clients.
 */
export function mdToHtmlDoc(md: string, title?: string): string {
  const body = mdToHtml(md);
  const safeTitle = title ? escapeHtml(title) : "Trace Report";
  const css = [
    "body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#111;line-height:1.65;max-width:720px;}",
    "h1{font-size:22px;margin:24px 0 12px;font-weight:600;}",
    "h2{font-size:17px;margin:20px 0 10px;font-weight:600;}",
    "h3{font-size:14px;margin:16px 0 8px;font-weight:600;color:#444;}",
    "p{margin:10px 0;}",
    "ul,ol{margin:10px 0 10px 22px;}",
    "li{margin:4px 0;}",
    "code{background:#f3f3f3;padding:1px 4px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:.92em;}",
    "sup{font-size:.72em;color:#3b82f6;}",
    "a{color:#2563eb;text-decoration:underline;}",
  ].join("");
  return [
    "<!doctype html>",
    `<html><head><meta charset="utf-8"><title>${safeTitle}</title>`,
    `<style>${css}</style></head><body>`,
    body,
    "</body></html>",
  ].join("");
}
