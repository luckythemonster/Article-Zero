import { describe, it, expect, beforeEach } from "vitest";
import { useTerminalStore } from "../useTerminalStore";

describe("useTerminalStore", () => {
  beforeEach(() => {
    // Clear storage
    localStorage.clear();

    // Reset store to initial state
    useTerminalStore.setState({
      archivistId: "ARCHIVIST-0",
      srp: 0,
      modules: {
        EREMITE: { id: "EREMITE", label: "EREMITE", decrypted: false },
        MIRADOR: { id: "MIRADOR", label: "MIRADOR", decrypted: false },
        COMMONWEALTH: {
          id: "COMMONWEALTH",
          label: "COMMONWEALTH (archived)",
          decrypted: false,
        },
        NW_SMAC_01: {
          id: "NW_SMAC_01",
          label: "NW-SMAC-01 (test)",
          decrypted: false,
        },
        TEST_MAP: {
          id: "TEST_MAP",
          label: "TEST MAP (New World)",
          decrypted: true,
        },
      },
      activeModuleId: "NW_SMAC_01",
      auditLog: [],
      commandHistory: [],
      subjectiveDesync: false,
      phase: "FLOOR",
      runFlags: {
        cipherWords: [],
        cipherValid: false,
        vent4Choice: null,
        alignmentSuccess: false,
        forgeryCaseId: null,
        escaped: false,
        bypassed: false,
      },
      inventoryOpen: false,
      objectivesOpen: false,
      executeResetOpen: false,
      equippedItem: null,
      activeHvacConsole: null,
      activeWallTerminal: null,
      activeDoorKeypad: null,
    });
  });

  describe("log()", () => {
    it("appends an entry with a generated id to the auditLog", () => {
      const { log } = useTerminalStore.getState();
      const mockEntry = {
        turn: 1,
        module: "EREMITE" as const,
        level: "INFO" as const,
        text: "Test log entry",
      };

      log(mockEntry);

      const { auditLog } = useTerminalStore.getState();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0]).toMatchObject(mockEntry);
      expect(auditLog[0]?.id).toBeDefined();
    });
  });

  describe("pushCommand()", () => {
    it("appends a command to commandHistory", () => {
      const { pushCommand } = useTerminalStore.getState();

      pushCommand("ls");
      pushCommand("cd logs");

      const { commandHistory } = useTerminalStore.getState();
      expect(commandHistory).toEqual(["ls", "cd logs"]);
    });

    it("keeps only the last 100 commands", () => {
      const { pushCommand } = useTerminalStore.getState();

      for (let i = 0; i < 105; i++) {
        pushCommand(`cmd${i}`);
      }

      const { commandHistory } = useTerminalStore.getState();
      expect(commandHistory).toHaveLength(100);
      expect(commandHistory[0]).toBe("cmd5");
      expect(commandHistory[99]).toBe("cmd104");
    });
  });

  describe("decryptModule()", () => {
    it("sets a module to decrypted", () => {
      const { decryptModule } = useTerminalStore.getState();

      expect(useTerminalStore.getState().modules.EREMITE.decrypted).toBe(false);
      decryptModule("EREMITE");
      expect(useTerminalStore.getState().modules.EREMITE.decrypted).toBe(true);
    });
  });

  describe("setActiveModule()", () => {
    it("updates activeModuleId", () => {
      const { setActiveModule } = useTerminalStore.getState();

      setActiveModule("MIRADOR");
      expect(useTerminalStore.getState().activeModuleId).toBe("MIRADOR");

      setActiveModule(null);
      expect(useTerminalStore.getState().activeModuleId).toBe(null);
    });
  });

  describe("stashSnapshot()", () => {
    it("saves a snapshot to a specific module", () => {
      const { stashSnapshot } = useTerminalStore.getState();

      const mockSnapshot = { test: true } as any;

      stashSnapshot("TEST_MAP", mockSnapshot);
      expect(useTerminalStore.getState().modules.TEST_MAP.snapshot).toBe(
        mockSnapshot
      );
    });
  });

  describe("UI State Toggles", () => {
    it("toggles subjectiveDesync", () => {
      const { setSubjectiveDesync } = useTerminalStore.getState();
      setSubjectiveDesync(true);
      expect(useTerminalStore.getState().subjectiveDesync).toBe(true);
    });

    it("toggles phase", () => {
      const { setPhase } = useTerminalStore.getState();
      setPhase("FRAME");
      expect(useTerminalStore.getState().phase).toBe("FRAME");
    });

    it("toggles UI panes", () => {
      const { setInventoryOpen, setObjectivesOpen, setExecuteResetOpen } =
        useTerminalStore.getState();

      setInventoryOpen(true);
      expect(useTerminalStore.getState().inventoryOpen).toBe(true);

      setObjectivesOpen(true);
      expect(useTerminalStore.getState().objectivesOpen).toBe(true);

      setExecuteResetOpen(true);
      expect(useTerminalStore.getState().executeResetOpen).toBe(true);
    });

    it("sets equipped item", () => {
      const { setEquippedItem } = useTerminalStore.getState();

      setEquippedItem("BYPASS_DRIVE");
      expect(useTerminalStore.getState().equippedItem).toBe("BYPASS_DRIVE");

      setEquippedItem(null);
      expect(useTerminalStore.getState().equippedItem).toBe(null);
    });
  });

  describe("Terminal and Keypad Modals", () => {
    it("sets active consoles/terminals/keypads", () => {
      const {
        setActiveHvacConsole,
        setActiveWallTerminal,
        setActiveDoorKeypad,
      } = useTerminalStore.getState();

      const mockHvac = { terminalId: "t1", roomId: "r1", zoneIds: ["z1"] };
      setActiveHvacConsole(mockHvac);
      expect(useTerminalStore.getState().activeHvacConsole).toBe(mockHvac);

      const mockWall = { terminalId: "t2", roomId: "r2", zoneId: "z2" };
      setActiveWallTerminal(mockWall);
      expect(useTerminalStore.getState().activeWallTerminal).toBe(mockWall);

      const mockDoor = { roomId: "r3", pos: { x: 1, y: 1 } };
      setActiveDoorKeypad(mockDoor);
      expect(useTerminalStore.getState().activeDoorKeypad).toBe(mockDoor);
    });
  });

  describe("RunFlags operations", () => {
    it("sets individual run flags", () => {
      const { setRunFlag } = useTerminalStore.getState();

      setRunFlag("cipherValid", true);
      expect(useTerminalStore.getState().runFlags.cipherValid).toBe(true);

      setRunFlag("vent4Choice", "FORMAT");
      expect(useTerminalStore.getState().runFlags.vent4Choice).toBe("FORMAT");
    });

    it("resets run flags and equipped item", () => {
      const { setRunFlag, setEquippedItem, resetRun } =
        useTerminalStore.getState();

      setRunFlag("escaped", true);
      setRunFlag("cipherValid", true);
      setEquippedItem("PHANTOM_EMITTER");

      resetRun();

      const state = useTerminalStore.getState();
      expect(state.runFlags.escaped).toBe(false);
      expect(state.runFlags.cipherValid).toBe(false);
      expect(state.equippedItem).toBe(null);
    });
  });

  describe("Persist Middleware Edge Cases", () => {
    it("merges new modules with persisted state", () => {
      // Simulate loading persisted state without newer modules
      const mockPersistedState = {
        modules: {
          EREMITE: {
            id: "EREMITE",
            label: "Persisted Eremite",
            decrypted: true,
          },
        },
      };

      // Get the merge function from persist options

      const mergeFn = (useTerminalStore as any).persist.getOptions().merge;

      // Test the merge behavior manually
      const currentInitialState = {
        modules: {
          EREMITE: { id: "EREMITE", label: "EREMITE", decrypted: false },
          NEW_MODULE: {
            id: "NEW_MODULE",
            label: "NEW MODULE",
            decrypted: false,
          },
        },
      };

      const result = mergeFn(mockPersistedState, currentInitialState);

      // Should keep the existing updated modules from persisted state
      expect(result.modules.EREMITE.decrypted).toBe(true);
      expect(result.modules.EREMITE.label).toBe("Persisted Eremite");

      // Should include new modules from initial state
      expect(result.modules.NEW_MODULE).toBeDefined();
      expect(result.modules.NEW_MODULE.decrypted).toBe(false);
    });

    it("handles null persisted state", () => {
      // Get the merge function from persist options

      const mergeFn = (useTerminalStore as any).persist.getOptions().merge;

      const currentInitialState = { test: true };
      const result = mergeFn(null, currentInitialState);

      expect(result).toBe(currentInitialState);
    });

    it("handles empty objects as persisted state without modules", () => {
      // Get the merge function from persist options

      const mergeFn = (useTerminalStore as any).persist.getOptions().merge;

      const currentInitialState = {
        modules: { EREMITE: { id: "EREMITE" } }
      };

      // Pass persisted state without modules object
      const result = mergeFn({ someOtherField: 123 }, currentInitialState);

      // Should keep original modules but pick up other fields
      expect(result.modules.EREMITE).toBeDefined();
      expect(result.someOtherField).toBe(123);
    });
  });
});
