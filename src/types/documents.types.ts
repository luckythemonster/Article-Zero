// Document Archive types — the rebuilt archive carries two kinds of records:
// alignment transcripts and extracted documents (terminal hacks).

export type RecordSource = "OFFICIAL" | "WITNESS" | "SYSTEM";

export type DocumentKind =
  | "ALIGNMENT_TRANSCRIPT"
  | "EXTRACTED_DOCUMENT";

export interface RecordEntry {
  source: RecordSource;
  kind: DocumentKind;
  body: string;
  struckThrough?: string[];
  filed: boolean;
  turn: number;
}

export interface DocumentCase {
  id: string;
  title: string;
  turn: number;
  records: RecordEntry[];
  /** Reserved for a future witness-vs-official mechanic. */
  disputed: boolean;
}
