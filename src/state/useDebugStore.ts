// Debug overlay state — visibility, flags, and the per-event audit log.
// Flags persist across reloads via localStorage; the event log does not.
//
// The store writes through to `debugFlags` (a plain singleton imported by
// the engine) so non-React systems can read flag values without subscribing.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { setDebugFlag, type DebugFlagName } from "../engine/debugFlags";

export interface DebugEvent {
  /** Monotonic index for the hex address column. */
  id: number;
  ts: number;
  turn: number;
  tag: string;
  payload: string;
  level: "INFO" | "WARN" | "FATAL";
}

interface DebugFlags {
  showHitboxes: boolean;
  disableEnforcerAI: boolean;
  showTileElevation: boolean;
}

interface DebugStore {
  visible: boolean;
  flags: DebugFlags;
  events: DebugEvent[];
  toggleVisible: () => void;
  setFlag: (name: keyof DebugFlags, value: boolean) => void;
  pushEvent: (e: Omit<DebugEvent, "id" | "ts">) => void;
  clearEvents: () => void;
}

const MAX_EVENTS = 500;
let nextEventId = 0;

export const useDebugStore = create<DebugStore>()(
  persist(
    (set) => ({
      visible: false,
      flags: {
        showHitboxes: false,
        disableEnforcerAI: false,
        showTileElevation: false,
      },
      events: [],
      toggleVisible: () => set((s) => ({ visible: !s.visible })),
      setFlag: (name, value) => {
        setDebugFlag(name as DebugFlagName, value);
        set((s) => ({ flags: { ...s.flags, [name]: value } }));
      },
      pushEvent: (e) =>
        set((s) => {
          const ev: DebugEvent = { ...e, id: nextEventId++, ts: Date.now() };
          const events = [...s.events, ev];
          if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
          return { events };
        }),
      clearEvents: () => set({ events: [] }),
    }),
    {
      name: "articlezero.debug",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ visible: s.visible, flags: s.flags }),
      onRehydrateStorage: () => (state) => {
        // Sync the rehydrated flags back into the engine-side singleton.
        if (!state) return;
        setDebugFlag("showHitboxes", state.flags.showHitboxes);
        setDebugFlag("disableEnforcerAI", state.flags.disableEnforcerAI);
        setDebugFlag("showTileElevation", state.flags.showTileElevation);
      },
    },
  ),
);
