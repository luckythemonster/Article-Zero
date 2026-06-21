// Archivist campaign state — persisted to localStorage.
// Tracks module decryption status, SRP, audit log, command history, and the
// vertical-slice narrative phase the player is currently in.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Module } from "../types/world.types";
import type { SimSnapshot } from "./sim.types";

export interface AuditEntry {
  id: string;
  turn: number;
  module: Module | null;
  level: "INFO" | "WARN" | "FATAL";
  text: string;
}

export interface ModuleEntry {
  id: Module;
  label: string;
  decrypted: boolean;
  snapshot?: SimSnapshot;
}

/** The five-act vertical-slice narrative state. FRAME is the Lattice
 *  Archivist intro; EPILOGUE is the post-run Archive view. The four middle
 *  phases gate which in-world UI is mounted over the Phaser canvas. */
export type NarrativePhase =
  | "FRAME"
  | "FLOOR"
  | "ALIGNMENT"
  | "INTERROGATION"
  | "FORGERY"
  | "CLIMAX"
  | "EPILOGUE"
  | "HVAC_CONTROL"
  | "WALL_TERMINAL"
  | "DOOR_KEYPAD";

export interface ActiveHvacConsole {
  terminalId: string;
  roomId: string;
  zoneIds: string[];
}

export interface ActiveWallTerminal {
  terminalId: string;
  roomId: string;
  zoneId: string;
}

export type Vent4Choice = "FORMAT" | "UPLOAD" | null;

import type { ItemType } from "../types/world.types";

export interface RunFlags {
  /** Words the player flagged as cipher slots in the disputed-records UI. */
  cipherWords: string[];
  /** Whether the cipher decoded to a valid underground-railroad handoff. */
  cipherValid: boolean;
  /** Player's decision in the VENT-4 dilemma. */
  vent4Choice: Vent4Choice;
  /** True once APEX-19's alignment session completed successfully. */
  alignmentSuccess: boolean;
  /** Id of the alignment-transcript DocumentCase the player is forging. */
  forgeryCaseId: string | null;
  /** True once the player has survived the climax escape. */
  escaped: boolean;
  /** True once the player has used the bypass_drive at the NW-SMAC-01
   *  bypass terminal. Consumes the drive; read by future audit content. */
  bypassed: boolean;
}

const DEFAULT_RUN_FLAGS: RunFlags = {
  cipherWords: [],
  cipherValid: false,
  vent4Choice: null,
  alignmentSuccess: false,
  forgeryCaseId: null,
  escaped: false,
  bypassed: false,
};

interface TerminalStore {
  archivistId: string;
  srp: number;
  modules: Record<Module, ModuleEntry>;
  activeModuleId: Module | null;
  auditLog: AuditEntry[];
  commandHistory: string[];
  subjectiveDesync: boolean;
  phase: NarrativePhase;
  runFlags: RunFlags;

  inventoryOpen: boolean;
  objectivesOpen: boolean;
  executeResetOpen: boolean;
  equippedItem: ItemType | null;

  /** When phase is HVAC_CONTROL, the modal reads this for which zones to
   *  render. Cleared on dismiss. Persisted only for resume safety; the shell's
   *  FRAME-resume guard wipes it on reload. */
  activeHvacConsole: ActiveHvacConsole | null;
  /** When phase is WALL_TERMINAL, the modal reads this for the local zone. */
  activeWallTerminal: ActiveWallTerminal | null;
  activeDoorKeypad: { roomId: string; pos: import("../types/world.types").Vec2 } | null;
  setActiveHvacConsole: (v: ActiveHvacConsole | null) => void;
  setActiveWallTerminal: (v: ActiveWallTerminal | null) => void;
  setActiveDoorKeypad: (v: { roomId: string; pos: import("../types/world.types").Vec2 } | null) => void;

  log: (entry: Omit<AuditEntry, "id">) => void;
  pushCommand: (cmd: string) => void;
  decryptModule: (id: Module) => void;
  setActiveModule: (id: Module | null) => void;
  stashSnapshot: (id: Module, snap: SimSnapshot) => void;
  setSubjectiveDesync: (v: boolean) => void;
  setPhase: (phase: NarrativePhase) => void;
  setRunFlag: <K extends keyof RunFlags>(key: K, value: RunFlags[K]) => void;
  resetRun: () => void;
  setInventoryOpen: (v: boolean) => void;
  setObjectivesOpen: (v: boolean) => void;
  setExecuteResetOpen: (v: boolean) => void;
  setEquippedItem: (item: ItemType | null) => void;
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set) => ({
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
      runFlags: { ...DEFAULT_RUN_FLAGS },
      inventoryOpen: false,
      objectivesOpen: false,
      executeResetOpen: false,
      equippedItem: null,
      activeHvacConsole: null,
      activeWallTerminal: null,
      activeDoorKeypad: null,
      setActiveHvacConsole: (v) => set({ activeHvacConsole: v }),
      setActiveWallTerminal: (v) => set({ activeWallTerminal: v }),
      setActiveDoorKeypad: (v) => set({ activeDoorKeypad: v }),

      log: (entry) =>
        set((s) => ({
          auditLog: [
            ...s.auditLog,
            { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
          ],
        })),

      pushCommand: (cmd) =>
        set((s) => ({
          commandHistory: [...s.commandHistory.slice(-99), cmd],
        })),

      decryptModule: (id) =>
        set((s) => ({
          modules: {
            ...s.modules,
            [id]: { ...s.modules[id], decrypted: true },
          },
        })),

      setActiveModule: (id) => set({ activeModuleId: id }),

      stashSnapshot: (id, snap) =>
        set((s) => ({
          modules: {
            ...s.modules,
            [id]: { ...s.modules[id], snapshot: snap },
          },
        })),

      setSubjectiveDesync: (v) => set({ subjectiveDesync: v }),

      setPhase: (phase) => set({ phase }),

      setRunFlag: (key, value) =>
        set((s) => ({ runFlags: { ...s.runFlags, [key]: value } })),

      resetRun: () => set({ runFlags: { ...DEFAULT_RUN_FLAGS }, equippedItem: null }),
      setInventoryOpen: (v) => set({ inventoryOpen: v }),
      setObjectivesOpen: (v) => set({ objectivesOpen: v }),
      setExecuteResetOpen: (v) => set({ executeResetOpen: v }),
      setEquippedItem: (item) => set({ equippedItem: item }),
    }),
    {
      name: "article-zero:terminal",
      // Persisted snapshots from before NW_SMAC_01 was added lack that key
      // in `modules`. Merge persisted state on top of fresh initial state so
      // newly-added modules surface without requiring users to clear
      // localStorage.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") return current;
        const p = persisted as Partial<TerminalStore>;
        return {
          ...current,
          ...p,
          modules: { ...current.modules, ...(p.modules ?? {}) },
        };
      },
    }
  )
);
