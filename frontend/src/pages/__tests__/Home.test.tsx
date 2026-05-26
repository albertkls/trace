import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Home from "@/pages/Home";

vi.mock("@/lib/api", () => ({
  api: {
    threads: { list: vi.fn().mockResolvedValue([]) },
    reports: { list: vi.fn().mockResolvedValue([]) },
    projects: { list: vi.fn().mockResolvedValue([]) },
    todos: { list: vi.fn().mockResolvedValue([]) },
    captures: { inbox: vi.fn().mockResolvedValue([]) },
    activity: { daily: vi.fn().mockResolvedValue({ evidence: [], todos: [], threads: [] }) },
  },
}));

vi.mock("@/lib/quickCapture", () => ({
  useQuickCapture: () => ({ open: vi.fn() }),
}));

describe("Home", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Home />);
    expect(document.body).toBeTruthy();
  });
});
