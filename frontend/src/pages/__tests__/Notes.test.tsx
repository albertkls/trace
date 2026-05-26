import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Notes from "@/pages/Notes";

vi.mock("@/lib/api", () => ({
  api: {
    notes: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projects: { list: vi.fn().mockResolvedValue([]) },
    threads: { list: vi.fn().mockResolvedValue([]) },
  },
}));

describe("Notes", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Notes />);
    expect(document.body).toBeTruthy();
  });

  it("shows the page header", () => {
    renderWithProviders(<Notes />);
    expect(document.body.textContent).toContain("记事");
  });
});
