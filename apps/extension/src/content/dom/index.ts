import { classicDom } from './classic.js';
import { modernDom } from './modern.js';
import type { DiffDom } from './types.js';

export * from './types.js';

const ADAPTERS: DiffDom[] = [modernDom, classicDom];

/** The adapter that recognises the current page, if any has rendered yet. */
export function detectDiffDom(): DiffDom | null {
  return ADAPTERS.find((adapter) => adapter.matches()) ?? null;
}
