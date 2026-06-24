// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExecuteResetModal from "./ExecuteResetModal";
import { worldEngine } from "../engine/WorldEngine";
import { useTerminalStore } from "../state/useTerminalStore";

// Mock worldEngine
vi.mock("../engine/WorldEngine", () => ({
  worldEngine: {
    wipeSubjective: vi.fn(),
  },
}));

// Mock useTerminalStore
vi.mock("../state/useTerminalStore", () => ({
  useTerminalStore: vi.fn(),
}));

describe("ExecuteResetModal", () => {
  let mockSetOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetOpen = vi.fn();

    // Default mock implementation for useTerminalStore
    // s => s.executeResetOpen or s => s.setExecuteResetOpen
    (useTerminalStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: any) => {
      const state = {
        executeResetOpen: true,
        setExecuteResetOpen: mockSetOpen,
      };
      return selector(state);
    });
  });

  it("should not propagate error if worldEngine.wipeSubjective throws, and should close modal", () => {
    // Arrange: Make wipeSubjective throw an error
    (worldEngine.wipeSubjective as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Simulated engine error during phase swap");
    });

    // Act
    render(<ExecuteResetModal />);

    // Find the EXECUTE 404 WIPE button
    const confirmButton = screen.getByRole("button", { name: "EXECUTE 404 WIPE" });

    // Click it - this should not throw an unhandled error
    expect(() => fireEvent.click(confirmButton)).not.toThrow();

    // Assert
    expect(worldEngine.wipeSubjective).toHaveBeenCalledTimes(1);
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });
});
