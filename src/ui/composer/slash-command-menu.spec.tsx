import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { SlashCommandMenu } from "./slash-command-menu";
import { getSlashCommandRegistry } from "../../extensions/slash-command-registry";
import "@testing-library/jest-dom";

// Mock the registry
jest.mock("../../extensions/slash-command-registry", () => ({
  getSlashCommandRegistry: jest.fn(),
}));

describe("SlashCommandMenu", () => {
  const mockCommands = [
    {
      name: "/gap",
      description: "Gap analysis",
      slashCommandId: "gap",
      onSelect: jest.fn(),
    },
    {
      name: "/risk",
      description: "Risk analysis",
      slashCommandId: "risk",
      onSelect: jest.fn(),
    },
    {
      name: "/help",
      description: "Help",
      slashCommandId: "help",
      onSelect: jest.fn(),
    },
  ];

  const defaultProps = {
    query: "",
    activeIndex: 0,
    onSelect: jest.fn(),
    onActiveIndexChange: jest.fn(),
    onItemsChange: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    (getSlashCommandRegistry as jest.Mock).mockReturnValue(mockCommands);
  });

  it("renders all commands when query is empty", () => {
    render(<SlashCommandMenu {...defaultProps} />);
    expect(screen.getByText("/gap")).toBeInTheDocument();
    expect(screen.getByText("/risk")).toBeInTheDocument();
    expect(screen.getByText("/help")).toBeInTheDocument();
  });

  it("filters commands by query", () => {
    render(<SlashCommandMenu {...defaultProps} query="ga" />);
    expect(screen.getByText("/gap")).toBeInTheDocument();
    expect(screen.queryByText("/risk")).not.toBeInTheDocument();
  });

  it("calls onSelect and onClose when a command is clicked", () => {
    render(<SlashCommandMenu {...defaultProps} />);
    fireEvent.click(screen.getByText("/gap"));
    expect(defaultProps.onSelect).toHaveBeenCalledWith("/gap");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onActiveIndexChange on mouse enter", () => {
    render(<SlashCommandMenu {...defaultProps} />);
    fireEvent.mouseEnter(screen.getByText("/risk"));
    expect(defaultProps.onActiveIndexChange).toHaveBeenCalledWith(1);
  });

  it("returns null when no commands match query", () => {
    const { container } = render(<SlashCommandMenu {...defaultProps} query="unknown" />);
    expect(container.firstChild).toBeNull();
  });
});
