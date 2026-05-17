// Reactive mirror of WorldEngine's in-memory state.
// WorldEngine calls syncFromWorldState() after each mutation;
// React components read physical/subjective selectors from here.

import { create } from "zustand";
import type { Module } from "../types/world.types";
import type { WorldState } from "../types/world.types";
import type { PhysicalState, SimSnapshot, SubjectiveState } from "./sim.types";
import { worldStateToSlices } from "./eraToSim";
import { serializePhysical, serializeSubjective } from "./serialize";
import { SEED_VERSIONS } from "../engine/WorldEngineState";

interface SimStore {
  physical: PhysicalState | null;
  subjective: SubjectiveState | null;
  activeModule: Module | null;

  /** WorldEngine calls this after every mutation. */
  syncFromWorldState: (ws: WorldState) => void;
  setActiveModule: (m: Module | null) => void;

  /** Serialise current slices into a portable snapshot (null if no module loaded). */
  buildSnapshot: () => SimSnapshot | null;
}

export const useSimStore = create<SimStore>((set, get) => ({
  physical: null,
  subjective: null,
  activeModule: null,

  syncFromWorldState: (ws) => {
    const { physical, subjective } = worldStateToSlices(ws);
    set({ physical, subjective });
  },

  setActiveModule: (m) => set({ activeModule: m }),

  buildSnapshot: () => {
    const { physical, subjective } = get();
    if (!physical) return null;
    return {
      physical: serializePhysical(physical),
      subjective: subjective ? serializeSubjective(subjective) : null,
      subjectiveWiped: subjective === null,
      seedVersion: SEED_VERSIONS[physical.era],
    };
  },
}));
