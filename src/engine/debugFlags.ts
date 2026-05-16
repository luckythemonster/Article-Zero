// Plain singleton mirror of the React debug store. Lets the engine read
// debug toggles without importing React/Zustand. The React store writes
// through to this object whenever a flag changes.

export const debugFlags = {
  showHitboxes: false,
  disableEnforcerAI: false,
  showTileElevation: false,
};

export type DebugFlagName = keyof typeof debugFlags;

export function setDebugFlag(name: DebugFlagName, value: boolean): void {
  debugFlags[name] = value;
}
