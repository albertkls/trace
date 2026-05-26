import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Projects from "@/pages/Projects";

vi.mock("@/lib/api", () => ({
  api: {
    projects: { list: vi.fn().mockResolvedValue([]) },
  },
}));

describe("Projects", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Projects />);
    expect(document.body).toBeTruthy();
  });

  it("shows the page header", () => {
    renderWithProviders(<Projects />);
    expect(document.body.textContent).toContain("项目");
  });
});
