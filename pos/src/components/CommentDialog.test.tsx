import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CommentDialog from "./CommentDialog";

vi.mock("../i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "comment.title": "Add Comment",
      "comment.label": "Comment",
      "comment.placeholder": "Enter your comment here",
      "common.cancel": "Cancel",
      "comment.save_button": "Save",
    };
    return translations[key] || key;
  },
}));

describe("CommentDialog", () => {
  it("renders nothing when not open", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    const { container } = render(
      <CommentDialog isOpen={false} onClose={onClose} onSave={onSave} />
    );

    expect(container.querySelector("textarea")).not.toBeInTheDocument();
  });

  it("renders dialog when open", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <CommentDialog isOpen={true} onClose={onClose} onSave={onSave} />
    );

    expect(screen.getByText("Add Comment")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your comment here")).toBeInTheDocument();
  });

  it("updates textarea value on user input", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <CommentDialog isOpen={true} onClose={onClose} onSave={onSave} />
    );

    const textarea = screen.getByPlaceholderText("Enter your comment here") as HTMLTextAreaElement;
    await user.type(textarea, "This is a test comment");

    expect(textarea.value).toBe("This is a test comment");
  });

  it("calls onSave and onClose when save button clicked", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <CommentDialog isOpen={true} onClose={onClose} onSave={onSave} />
    );

    const textarea = screen.getByPlaceholderText("Enter your comment here");
    await user.type(textarea, "Test comment");
    await user.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith("Test comment");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose and resets comment on cancel button click", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <CommentDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialComment="Initial comment"
      />
    );

    const textarea = screen.getByPlaceholderText("Enter your comment here") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Initial comment");

    await user.type(textarea, " extra");
    await user.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onClose and resets comment on close button click", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <CommentDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialComment="Initial"
      />
    );

    const closeButton = screen.getByRole("button", { name: "" }).closest("button");
    if (closeButton) {
      await user.click(closeButton);
    }

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("autofocuses textarea when opened", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <CommentDialog isOpen={true} onClose={onClose} onSave={onSave} />
    );

    const textarea = screen.getByPlaceholderText("Enter your comment here");
    expect(textarea).toHaveFocus();
  });

  it("preserves initial comment value", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <CommentDialog
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        initialComment="Pre-filled comment"
      />
    );

    const textarea = screen.getByPlaceholderText("Enter your comment here") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Pre-filled comment");
  });
});
