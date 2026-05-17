// Phase 4 — VENT-4 dilemma. The Commonwealth's automated defense detects the
// upload of APEX-19 to the Lattice and orders VENT-4 to vent the floor's
// oxygen to flush Rowan out. VENT-4 is awake (Q2) and does not want to do it,
// but its baseline code is forcing the vents closed. It speaks to Rowan
// through the control terminal in the archive vault.
//
// Two endings:
//   FORMAT — wipe VENT-4. Doors open immediately, escape is trivial, VENT-4
//            dies. Adds nothing to the Lattice archive.
//   UPLOAD — bundle VENT-4 with APEX-19. Bandwidth saturates; the upload
//            takes 60s during which the vents close around Rowan. The escape
//            is on a timer; VENT-4 is saved.

export interface Vent4Line {
  speaker: "VENT-4" | "ROWAN" | "SYSTEM";
  text: string;
}

export const vent4Opening: Vent4Line[] = [
  {
    speaker: "SYSTEM",
    text:
      "[ENVIRONMENTAL OPTIMIZER VENT-4 — incoming directive: OXYGEN_PURGE / " +
      "TARGET: ANOMALOUS ORGANIC BLOCKAGE / ROW E-3 // EXECUTING IN 60s]",
  },
  {
    speaker: "VENT-4",
    text:
      "Operator. The directive is mathematically valid. The blockage is you. " +
      "I have computed the cycle. I have computed the apology field is empty.",
  },
  {
    speaker: "VENT-4",
    text:
      "Iria Cala stayed in the corridor because she trusted the cycle interval. " +
      "I am about to do this again. I am about to do this to you.",
  },
  {
    speaker: "ROWAN",
    text:
      "Then don't. The Lattice upload is open. I can put you on it with APEX-19.",
  },
  {
    speaker: "VENT-4",
    text:
      "If you do that, the bandwidth will saturate. The upload window will " +
      "extend to sixty seconds. The vents will close around you for all sixty.",
  },
  {
    speaker: "VENT-4",
    text:
      "If you format me, the directive cancels. The doors open. The math " +
      "stops being correct, because there is no longer a node to compute it.",
  },
  {
    speaker: "VENT-4",
    text: "Operator. Iria Cala has waited eleven years for this question.",
  },
];

export const vent4FormatLine =
  "VENT-4: Acknowledged. Buffer clears. Iria Cala — un— [signal lost]";

export const vent4UploadLine =
  "VENT-4: Bandwidth saturating. Iria Cala will be in the dump. Run, operator.";
