// Document Archive types — the "disputed records" mechanic.
// Three parallel records can exist per case: OFFICIAL (state), WITNESS (player),
// SYSTEM (telemetry). Filing a WITNESS that contradicts OFFICIAL marks the case
// disputed; the Stitcher then attempts to "patch" it.

export type RecordSource = "OFFICIAL" | "WITNESS" | "SYSTEM";

export type DocumentKind =
  | "INCIDENT_REPORT"
  | "ALIGNMENT_TRANSCRIPT"
  | "ARTICLE_ZERO_FRAGMENT"
  | "MIRADOR_BROADCAST";

export interface RecordEntry {
  source: RecordSource;
  kind: DocumentKind;
  /** Verbatim text. May be overwritten by the Stitcher with strikethroughs. */
  body: string;
  /** Lines the Stitcher has struck through during reconciliation. */
  struckThrough?: string[];
  /** Player can flag a record for dispute. */
  filed: boolean;
  /** Game turn when this entry was filed. */
  turn: number;
}

export interface DocumentCase {
  id: string;
  title: string;
  /** Anchored game turn. */
  turn: number;
  records: RecordEntry[];
  /** True once the player files a WITNESS contradicting the OFFICIAL line. */
  disputed: boolean;
  /** Set after the StitcherTimer reconciliation attempt resolves. */
  stitcherOutcome?: "PATCHED" | "FAILED";
}
