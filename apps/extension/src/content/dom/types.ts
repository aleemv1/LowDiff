export type Side = 'LEFT' | 'RIGHT';

/** A single rendered diff line in GitHub's own markup. */
export interface DomLine {
  side: Side;
  line: number;
  /** The row element a badge is anchored into. */
  row: HTMLElement;
  /** The cell holding the code text, where the badge is appended. */
  codeCell: HTMLElement;
}

/**
 * Reads GitHub's rendered diff so notes can be attached to their real rows.
 *
 * GitHub runs more than one generation of this markup at a time (the classic
 * server-rendered table and the newer client-rendered view), and which one you
 * get depends on the account. Each generation gets an adapter; the content
 * script picks whichever one recognises the page.
 */
export interface DiffDom {
  readonly name: string;
  /** True when this adapter recognises the current page. */
  matches(): boolean;
  /** Paths of the files GitHub has rendered so far. */
  paths(): string[];
  /** Every rendered line for a file, keyed for lookup. */
  lines(path: string): DomLine[];
}
