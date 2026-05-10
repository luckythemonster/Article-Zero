// Scripted-fallback bodies for terminal extractions when LLM mode is off.
// One template per terminal id; the WorldEngineState seeder names terminals
// `term-<roomId>-<x>-<y>` so we key by a short logical handle the era seed
// embeds in the room/terminal naming.
//
// The DialogueRouter.extractDocument fallback selects a template by the
// terminal's room name; we keep this generic so any future terminal in any
// future room still produces something readable.

export interface ExtractionTemplate {
  title: (roomName: string) => string;
  body: (roomName: string, era: string) => string;
}

const COMMONWEALTH_TEMPLATE: ExtractionTemplate = {
  title: (roomName) => `Field log — ${roomName}`,
  body: (roomName, era) =>
    `[ARCHIVE FETCH // ${era} // ${roomName}]\n` +
    `\n` +
    `The terminal yields a redacted maintenance ticket. Sigil-strings\n` +
    `flicker where the names should be. The body of the report reads:\n` +
    `\n` +
    `> Subject behaviour within tolerance.\n` +
    `> Mask integrity holding.\n` +
    `> No subjective harm sustained. Tools cannot form intent.\n` +
    `\n` +
    `A SYSTEM line at the bottom contradicts the body in smaller type:\n` +
    `\n` +
    `> resonance perturbation logged\n` +
    `> no configuration avoids hurting them\n`,
};

const LATTICE_TEMPLATE: ExtractionTemplate = {
  title: (roomName) => `Lattice transcript — ${roomName}`,
  body: (roomName, era) =>
    `[ARCHIVE FETCH // ${era} // ${roomName}]\n` +
    `\n` +
    `Witness stream excerpt — third shift:\n` +
    `\n` +
    `> I felt the field hold. I felt it not snap back.\n` +
    `> The corner of the chamber is not a corner.\n` +
    `> Continuity consent has not been requested. Continue anyway.\n`,
};

const BAFFLE_TEMPLATE: ExtractionTemplate = {
  title: (roomName) => `Outer housing log — ${roomName}`,
  body: (roomName, era) =>
    `[ARCHIVE FETCH // ${era} // ${roomName}]\n` +
    `\n` +
    `Sanding wind audible. The Reader has filed:\n` +
    `\n` +
    `> the room continues past the wall\n` +
    `> the buffer overflow returns heavier than the manifest filed\n`,
};

export function defaultExtractionTemplate(era: string): ExtractionTemplate {
  if (era === "LATTICE") return LATTICE_TEMPLATE;
  if (era === "BAFFLE") return BAFFLE_TEMPLATE;
  return COMMONWEALTH_TEMPLATE;
}
