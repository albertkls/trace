import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import Todos from "@/pages/Todos";

vi.mock("@/lib/api", () => ({
  api: {
    todos: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    threads: { list: vi.fn().mockResolvedValue([]) },
  },
}));

describe("Todos", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Todos />);
    expect(document.body).toBeTruthy();
  });

  it("shows the page header", () => {
    renderWithProviders(<Todos />);
    expect(document.body.textContent).toContain("待办");
  });
});
