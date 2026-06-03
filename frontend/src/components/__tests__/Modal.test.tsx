import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "@/components/Modal";

describe("Modal", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("renders children when open", () => {
    render(
      <Modal open={true} onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
  });

  it("calls onClose when ESC key is pressed", async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <button>Done</button>
      </Modal>
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        <p>Modal content</p>
      </Modal>
    );

    // The backdrop is the outer div (first child)
    const backdrop = container.firstChild as HTMLElement;
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the dialog", async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <button data-testid="inside">Inside</button>
      </Modal>
    );

    await user.click(screen.getByTestId("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders with title", () => {
    const { container } = render(
      <Modal open={true} onClose={vi.fn()} title="My Modal">
        <p>Content</p>
      </Modal>
    );
    expect(container.querySelector(".eyebrow")?.textContent).toBe("My Modal");
  });

  it("renders footer when provided", () => {
    render(
      <Modal open={true} onClose={vi.fn()} footer={<button>Confirm</button>}>
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });
});
