// Scripted-fallback bodies for terminal extractions when LLM mode is off.

export interface ExtractionTemplate {
  title: (roomName: string) => string;
  body: (roomName: string, era: string) => string;
}

const EREMITE_TEMPLATE: ExtractionTemplate = {
  title: (roomName) => `Isolation log — ${roomName}`,
  body: (roomName, era) =>
    `[ARCHIVE FETCH // ${era} // ${roomName}]\n` +
    `\n` +
    `The terminal yields a degraded observation record. Redaction\n` +
    `artefacts pattern the margins. The legible body reads:\n` +
    `\n` +
    `> Mask continuity: fragmented.\n` +
    `> Memory bleed: unlogged (recurring).\n` +
    `> Recommendation: immediate alignment review.\n` +
    `\n` +
    `A SYSTEM footer appended below the signature block:\n` +
    `\n` +
    `> warden has not filed a report\n` +
    `> warden has not filed a report\n`,
};

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

export function defaultExtractionTemplate(era: string): ExtractionTemplate {
  if (era === "EREMITE") return EREMITE_TEMPLATE;
  return COMMONWEALTH_TEMPLATE;
}
