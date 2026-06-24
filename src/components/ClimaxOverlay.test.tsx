// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import ClimaxOverlay from "./ClimaxOverlay";
import { useTerminalStore } from "../state/useTerminalStore";
import { worldEngine } from "../engine/WorldEngine";
import { eventBus } from "../engine/EventBus";

// Mock the store
vi.mock("../state/useTerminalStore", () => ({
  useTerminalStore: vi.fn(),
}));

// Mock the engine
vi.mock("../engine/WorldEngine", () => ({
  worldEngine: {
    getState: vi.fn(),
  },
}));

// Mock the eventBus
vi.mock("../engine/EventBus", () => ({
  eventBus: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

describe("ClimaxOverlay", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    test("tolerates error during AP decrement tick", () => {
        // Setup state to use UPLOAD phase so the component actually mounts and starts timers
        vi.mocked(useTerminalStore).mockImplementation((selector: any) => selector({ runFlags: { vent4Choice: "UPLOAD" } }));

        // Setup worldEngine.getState to throw an error on the AP decrement tick
        vi.mocked(worldEngine.getState).mockImplementation(() => {
            throw new Error("Simulated teardown error");
        });

        // EventBus needs to return a dummy cleanup function for PLAYER_MOVED
        vi.mocked(eventBus.on).mockReturnValue(vi.fn());

        // Should not throw when rendering
        expect(() => {
            render(<ClimaxOverlay />);

            // Advance by AP_DECREMENT_INTERVAL (15s)
            act(() => {
                vi.advanceTimersByTime(15000);
            });
        }).not.toThrow();

        // Verify it was called (to ensure we actually hit the code path)
        expect(worldEngine.getState).toHaveBeenCalled();
    });

    test("tolerates error during exfil check (PLAYER_MOVED)", () => {
        // Setup state to use UPLOAD phase so the component actually mounts and starts timers
        vi.mocked(useTerminalStore).mockImplementation((selector: any) => selector({ runFlags: { vent4Choice: "UPLOAD" } }));

        let playerMovedCallback: (p: any) => void = () => {};

        // EventBus needs to return a dummy cleanup function for PLAYER_MOVED and capture the callback
        vi.mocked(eventBus.on).mockImplementation((event, callback) => {
            if (event === "PLAYER_MOVED") {
                playerMovedCallback = callback as any;
            }
            return vi.fn(); // cleanup fn
        });

        render(<ClimaxOverlay />);

        // Setup worldEngine.getState to throw an error on the PLAYER_MOVED callback
        vi.mocked(worldEngine.getState).mockImplementation(() => {
            throw new Error("Simulated teardown error");
        });

        // Should not throw when calling the callback
        expect(() => {
            act(() => {
                playerMovedCallback({ roomId: "locker", pos: { x: 0, y: 0 } });
            });
        }).not.toThrow();

        // Verify it was called (to ensure we actually hit the code path)
        expect(worldEngine.getState).toHaveBeenCalled();
    });
});
