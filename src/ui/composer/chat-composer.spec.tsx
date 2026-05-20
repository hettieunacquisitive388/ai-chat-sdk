import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ChatComposer } from "./chat-composer";
import { useChatContext } from "../../headless/context/chat-provider";
import { defaultStrings } from "../../headless/types/config";
import "@testing-library/jest-dom";

jest.mock("../../headless/context/chat-provider", () => ({
  useChatContext: jest.fn(),
}));

describe("ChatComposer", () => {
  const mockOnSendMessage = jest.fn();
  const mockConfig = { enableSlashCommands: true };

  beforeEach(() => {
    (useChatContext as jest.Mock).mockReturnValue({
      config: mockConfig,
      strings: defaultStrings,
      currentSession: null,
      activeContextId: undefined,
      activeContextLabel: undefined,
      setActiveContext: jest.fn(),
      announcement: null,
      setAnnouncement: jest.fn(),
      adapter: {
        uploadFile: undefined,
        deleteSessionFile: undefined,
        createSession: jest.fn(),
      },
      organizationId: "org-123",
    });
  });

  it("renders correctly with generic placeholder", () => {
    render(<ChatComposer onSendMessage={mockOnSendMessage} />);
    expect(screen.getByPlaceholderText(defaultStrings.composerPlaceholder)).toBeInTheDocument();
  });

  it("shows slash menu when typing / and enabled", () => {
    render(<ChatComposer onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText(defaultStrings.composerPlaceholder);
    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("does not show slash menu when typing / and disabled", () => {
    (useChatContext as jest.Mock).mockReturnValue({
      config: { enableSlashCommands: false },
      strings: defaultStrings,
      currentSession: null,
      activeContextId: undefined,
      activeContextLabel: undefined,
      setActiveContext: jest.fn(),
      announcement: null,
      setAnnouncement: jest.fn(),
      adapter: {
        uploadFile: undefined,
        deleteSessionFile: undefined,
        createSession: jest.fn(),
      },
      organizationId: "org-123",
    });
    render(<ChatComposer onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText(defaultStrings.composerPlaceholder);
    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("calls onSendMessage on enter", () => {
    render(<ChatComposer onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText(defaultStrings.composerPlaceholder);
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });
    expect(mockOnSendMessage).toHaveBeenCalledWith("Hello", undefined);
  });

  it("closes slash menu on Escape", () => {
    render(<ChatComposer onSendMessage={mockOnSendMessage} />);
    const textarea = screen.getByPlaceholderText(defaultStrings.composerPlaceholder);
    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
