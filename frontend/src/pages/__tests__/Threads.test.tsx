import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Threads from "@/pages/Threads";

vi.mock("@/lib/api", () => ({
  api: {
    threads: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    projects: { list: vi.fn().mockResolvedValue([]) },
  },
}));

describe("Threads", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Threads />);
    expect(document.body).toBeTruthy();
  });

  it("shows the page header", () => {
    renderWithProviders(<Threads />);
    expect(document.body.textContent).toContain("工作线");
  });
});
