import { describe, it, expect } from "vitest";
import { sanitizeTodoHtml, todoPreview, todoRichTextToPlainText } from "@/lib/richText";

describe("sanitizeTodoHtml", () => {
  it("strips event handler attributes", () => {
    const result = sanitizeTodoHtml('<img onerror="alert(1)" src="x">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert");
  });

  it("strips onclick from allowed tags", () => {
    const result = sanitizeTodoHtml('<strong onclick="alert(1)">text</strong>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  it("strips style attributes", () => {
    const result = sanitizeTodoHtml('<div style="background:url(javascript:alert(1))">text</div>');
    expect(result).not.toContain("style");
    expect(result).not.toContain("javascript");
  });

  it("preserves allowed tags", () => {
    const result = sanitizeTodoHtml("<strong>bold</strong> and <em>italic</em>");
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
  });

  it("strips disallowed tags but keeps content", () => {
    const result = sanitizeTodoHtml("<script>alert(1)</script>safe text");
    expect(result).not.toContain("<script>");
    expect(result).toContain("safe text");
  });

  it("converts plain text to paragraphs", () => {
    const result = sanitizeTodoHtml("line one\nline two");
    expect(result).toContain("<p>");
  });
});

describe("todoRichTextToPlainText", () => {
  it("extracts plain text from HTML", () => {
    const result = todoRichTextToPlainText("<strong>hello</strong> world");
    expect(result).toBe("hello world");
  });

  it("handles empty input", () => {
    expect(todoRichTextToPlainText("")).toBe("");
  });
});

describe("todoPreview", () => {
  it("truncates long text", () => {
    const long = "a".repeat(200);
    const result = todoPreview(long, 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).toContain("…");
  });

  it("preserves short text", () => {
    const result = todoPreview("short");
    expect(result).toBe("short");
  });
});
