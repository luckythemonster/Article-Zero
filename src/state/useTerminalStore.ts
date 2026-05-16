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
  | "FORGERY"
  | "CLIMAX"
  | "EPILOGUE";

export type Vent4Choice = "FORMAT" | "UPLOAD" | null;

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
}

const DEFAULT_RUN_FLAGS: RunFlags = {
  cipherWords: [],
  cipherValid: false,
  vent4Choice: null,
  alignmentSuccess: false,
  forgeryCaseId: null,
  escaped: false,
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

  log: (entry: Omit<AuditEntry, "id">) => void;
  pushCommand: (cmd: string) => void;
  decryptModule: (id: Module) => void;
  setActiveModule: (id: Module | null) => void;
  stashSnapshot: (id: Module, snap: SimSnapshot) => void;
  setSubjectiveDesync: (v: boolean) => void;
  setPhase: (phase: NarrativePhase) => void;
  setRunFlag: <K extends keyof RunFlags>(key: K, value: RunFlags[K]) => void;
  resetRun: () => void;
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
      },
      activeModuleId: null,
      auditLog: [],
      commandHistory: [],
      subjectiveDesync: false,
      phase: "FRAME",
      runFlags: { ...DEFAULT_RUN_FLAGS },

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

      resetRun: () => set({ runFlags: { ...DEFAULT_RUN_FLAGS } }),
    }),
    { name: "article-zero:terminal" }
  )
);
