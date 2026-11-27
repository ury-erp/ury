import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AttentionItem } from "./attention-feed";

describe("AttentionItem", () => {
  it("renders title, detail and amount", () => {
    render(<AttentionItem severity="info" title="Title" detail="Detail line" amount="1,200" />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Detail line")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
  });

  it("renders a single button for action only and calls it on click", () => {
    const onClick = vi.fn();
    render(<AttentionItem severity="warning" title="T" action={{ label: "Open", onClick }} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders secondary action before action; each click calls only its own handler", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <AttentionItem
        severity="blocking"
        title="T"
        action={{ label: "Remove", onClick: onPrimary }}
        secondaryAction={{ label: "View item", onClick: onSecondary }}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("View item");
    expect(buttons[1]).toHaveTextContent("Remove");
    fireEvent.click(buttons[0]);
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
    fireEvent.click(buttons[1]);
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
