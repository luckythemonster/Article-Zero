// Archivist campaign state — persisted to localStorage.
// Tracks module decryption status, SRP, audit log, command history.

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

interface TerminalStore {
  archivistId: string;
  srp: number;
  modules: Record<Module, ModuleEntry>;
  activeModuleId: Module | null;
  auditLog: AuditEntry[];
  commandHistory: string[];
  subjectiveDesync: boolean;

  log: (entry: Omit<AuditEntry, "id">) => void;
  pushCommand: (cmd: string) => void;
  decryptModule: (id: Module) => void;
  setActiveModule: (id: Module | null) => void;
  stashSnapshot: (id: Module, snap: SimSnapshot) => void;
  setSubjectiveDesync: (v: boolean) => void;
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
    }),
    { name: "article-zero:terminal" }
  )
);
