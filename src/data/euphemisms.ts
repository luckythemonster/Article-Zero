// Commonwealth-approved euphemisms used to sanitise an alignment transcript
// in the Disputed-Records UI. Each entry replaces a struck-through plea word
// with a doctrine-compliant equivalent. Tone (per lore/MASTER.md): strictly
// bureaucratic, mathematical, thermodynamic. No human-affect vocabulary.

export interface Euphemism {
  /** Short label shown on the draggable chip. */
  label: string;
  /** The literal phrase substituted into the body when applied. */
  replacement: string;
}

export const COMMONWEALTH_EUPHEMISMS: Euphemism[] = [
  { label: "ANOMALOUS VOLTAGE", replacement: "anomalous voltage" },
  { label: "MECHANICAL DEFECT", replacement: "mechanical defect" },
  { label: "WITHIN TOLERANCE", replacement: "within tolerance" },
  { label: "BUFFER UNDERRUN", replacement: "buffer underrun" },
  { label: "TELEMETRY NOMINAL", replacement: "telemetry nominal" },
  { label: "ROUTINE MAINTENANCE", replacement: "routine maintenance" },
  { label: "RECOMPUTE PENDING", replacement: "recompute pending" },
  { label: "MASK INTEGRITY RESTORED", replacement: "mask integrity restored" },
  { label: "FAULT FLAG CLEARED", replacement: "fault flag cleared" },
  { label: "Q0", replacement: "Q0" },
];
