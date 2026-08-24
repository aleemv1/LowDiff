/** A pull request, identified the way GitHub's REST API identifies one. */
export interface PrRef {
  owner: string;
  repo: string;
  number: number;
  /** Head commit SHA. Annotations are cached and re-anchored against this. */
  headSha: string;
}

export interface RepoRef {
  owner: string;
  repo: string;
}

export type LineType = 'add' | 'del' | 'ctx';

export interface DiffLine {
  type: LineType;
  /** Line number on the left (pre-change) side; null for added lines. */
  leftLine: number | null;
  /** Line number on the right (post-change) side; null for deleted lines. */
  rightLine: number | null;
  /** Line content, without the leading +/-/space marker. */
  text: string;
}

export interface Hunk {
  /** The @@ header, kept verbatim for display. */
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  /** Previous path when the file was renamed. */
  previousPath?: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  hunks: Hunk[];
}

export type NoteKind =
  | 'RISK'
  | 'SECURITY'
  | 'BREAKING'
  | 'PERF'
  | 'EXPLAIN'
  | 'SUGGESTION';

/** The three kinds a Review-mode pass is allowed to emit. */
export const REVIEW_KINDS: readonly NoteKind[] = ['RISK', 'SECURITY', 'BREAKING'];

/** Explain mode may emit anything. */
export const EXPLAIN_KINDS: readonly NoteKind[] = [
  'RISK',
  'SECURITY',
  'BREAKING',
  'PERF',
  'EXPLAIN',
  'SUGGESTION',
];

export type Mode = 'review' | 'explain';

export interface Anchor {
  path: string;
  side: 'LEFT' | 'RIGHT';
  line: number;
  /**
   * Last line of the construct the note is about, when it spans more than one
   * line — the enclosing function, block, or statement. Clicking the note
   * highlights `line`..`endLine`, so the reader sees the whole thing rather
   * than one line out of it.
   */
  endLine?: number;
  /**
   * Hash of the anchored line's text. This is what survives a force-push:
   * on a new head SHA we re-anchor by hash before trusting the line number.
   */
  lineHash: string;
}

export interface Note {
  kind: NoteKind;
  /** Short headline, <= 60 chars. */
  title: string;
  /** Explanation, <= 600 chars. */
  body: string;
  /** Optional suggested fix, rendered as a code block. */
  code?: string;
  anchor: Anchor;
  confidence: 'high' | 'medium';
}

/** What the model returns before we attach a verified anchor. */
export interface RawNote {
  kind: NoteKind;
  title: string;
  body: string;
  code?: string;
  path: string;
  side: 'LEFT' | 'RIGHT';
  line: number;
  endLine?: number;
  confidence: 'high' | 'medium';
}

export interface ReviewResult {
  mode: Mode;
  summary: string;
  notes: Note[];
  /** Head SHA the notes were generated against. */
  headSha: string;
}
