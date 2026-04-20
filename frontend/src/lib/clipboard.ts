/** Clipboard + download helpers for report export. */

export async function copyPlain(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard API not available");
}

/**
 * Copy both HTML and plain-text to the clipboard. Pasting into rich-text
 * targets (Feishu docs, Notion, Gmail, Google Docs) picks up the HTML;
 * pasting into plain-text targets falls back to `text`.
 */
export async function copyRich({
  html,
  text,
}: {
  html: string;
  text: string;
}): Promise<void> {
  // Feature-detect ClipboardItem + clipboard.write (needed for multi-MIME).
  const C = (
    globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }
  ).ClipboardItem;
  if (C && navigator.clipboard?.write) {
    const item = new C({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
  // Fallback: plain text only.
  await copyPlain(text);
}

export function downloadFile(
  filename: string,
  content: string,
  mime = "text/markdown;charset=utf-8"
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke slightly so Safari actually reads the blob.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Safe filename — keep Chinese, strip problem chars. */
export function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|\n\r\t]/g, "_").slice(0, 120) || "report";
}
