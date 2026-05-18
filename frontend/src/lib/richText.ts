const ALLOWED_TAGS = new Set([
  "B",
  "BR",
  "DIV",
  "EM",
  "I",
  "LI",
  "OL",
  "P",
  "S",
  "STRONG",
  "U",
  "UL",
]);

const INLINE_TAGS = new Set(["B", "EM", "I", "S", "STRONG", "U"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line) => `<p>${line.trim() ? escapeHtml(line) : "<br>"}</p>`)
    .join("");
}

function cleanNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as HTMLElement;
  if (!ALLOWED_TAGS.has(element.tagName)) {
    const fragment = document.createDocumentFragment();
    element.childNodes.forEach((child) => {
      const cleaned = cleanNode(child);
      if (cleaned) fragment.appendChild(cleaned);
    });
    return fragment;
  }

  const tag = element.tagName.toLowerCase();
  const cleanedElement = document.createElement(tag);
  element.childNodes.forEach((child) => {
    const cleaned = cleanNode(child);
    if (cleaned) cleanedElement.appendChild(cleaned);
  });

  if (
    INLINE_TAGS.has(element.tagName) &&
    cleanedElement.textContent?.trim() === ""
  ) {
    return null;
  }

  if (tag !== "br" && cleanedElement.childNodes.length === 0) {
    cleanedElement.appendChild(document.createElement("br"));
  }

  return cleanedElement;
}

export function sanitizeTodoHtml(value: string): string {
  const source = value.includes("<") ? value : textToHtml(value);
  const template = document.createElement("template");
  template.innerHTML = source;

  const container = document.createElement("div");
  template.content.childNodes.forEach((node) => {
    const cleaned = cleanNode(node);
    if (cleaned) container.appendChild(cleaned);
  });

  const html = container.innerHTML.trim();
  return html || "";
}

export function todoRichTextToPlainText(value: string): string {
  if (!value) return "";
  const container = document.createElement("div");
  container.innerHTML = sanitizeTodoHtml(value);
  return (container.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function todoPreview(value: string, maxLength = 96): string {
  const plain = todoRichTextToPlainText(value);
  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1)}…` : plain;
}
