/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Note } from '@lowdiff/core';
import { modernDom } from '../src/content/dom/modern.js';
import { classicDom } from '../src/content/dom/classic.js';
import { InlineNotes } from '../src/content/inline-notes.js';

const finding: Note = {
  kind: 'RISK', title: 'Request race', body: 'Cancel earlier requests.', confidence: 'high',
  anchor: { path: 'search.ts', side: 'RIGHT', line: 26, lineHash: 'abc' },
};

function fixture(classic = false) {
  const rows = [25, 26, 27, 28].map(n => classic
    ? `<tr><td class="blob-num" data-line-number="${n}"></td><td class="blob-num" data-line-number="${n}"></td><td class="blob-code">code ${n}</td></tr>`
    : `<tr><td data-diff-side="right" data-line-number="${n}">${n}</td><td data-diff-side="right" data-line-number="${n}" data-line-anchor="R${n}">code ${n}</td></tr>`).join('');
  document.body.innerHTML = `<div class="file" data-tagsearch-path="search.ts"><table class="diff-table" role="grid" aria-label="Diff for: search.ts"><tbody>${rows}</tbody></table></div>`;
}

beforeEach(() => fixture());

describe('inline discussion placement', () => {
  for (const classic of [false, true]) {
    it(`inserts beneath the cited line, before remaining code (${classic ? 'classic' : 'modern'})`, () => {
      fixture(classic);
      const slots = new InlineNotes().sync([finding], classic ? classicDom : modernDom);
      expect(slots).toHaveLength(1);
      const row = slots[0]!.row;
      expect(row.previousElementSibling!.textContent).toContain('code 26');
      expect(row.nextElementSibling!.textContent).toContain('code 27');
      expect((row.firstElementChild as HTMLTableCellElement).colSpan).toBe(classic ? 3 : 2);
    });
  }

  it('places a section finding below its last rendered line', () => {
    const slots = new InlineNotes().sync([{ ...finding, anchor: { ...finding.anchor, endLine: 27 } }], modernDom);
    expect(slots[0]!.row.previousElementSibling!.textContent).toContain('code 27');
    expect(slots[0]!.row.nextElementSibling!.textContent).toContain('code 28');
  });

  it('does not attach to the wrong side or an absent anchor', () => {
    const manager = new InlineNotes();
    expect(manager.sync([{ ...finding, anchor: { ...finding.anchor, side: 'LEFT' } }], modernDom)).toHaveLength(0);
    expect(manager.sync([{ ...finding, anchor: { ...finding.anchor, line: 99 } }], modernDom)).toHaveLength(0);
  });

  it('preserves the discussion container through same-size GitHub row replacements', () => {
    const manager = new InlineNotes();
    const first = manager.sync([finding], modernDom)[0]!;
    first.container.textContent = 'A drafted follow-up';
    fixture();
    const restored = manager.sync([finding], modernDom)[0]!;
    expect(restored.container).toBe(first.container);
    expect(restored.container.textContent).toBe('A drafted follow-up');
    expect(restored.row.isConnected).toBe(true);
    expect(restored.row.previousElementSibling!.textContent).toContain('code 26');
  });

  it('preserves note order for multiple findings on the same line without duplicating rows', () => {
    const manager = new InlineNotes();
    const notes = [finding, { ...finding, kind: 'BREAKING' as const, title: 'API changed' }];
    manager.sync(notes, modernDom);
    const slots = manager.sync(notes, modernDom);
    expect(document.querySelectorAll('[data-lowdiff-thread]')).toHaveLength(2);
    expect(slots[0]!.row.nextElementSibling).toBe(slots[1]!.row);
    expect(slots[1]!.row.nextElementSibling!.textContent).toContain('code 27');
  });

  it('removes filtered findings and clears all rows on teardown', () => {
    const manager = new InlineNotes();
    manager.sync([finding], modernDom);
    expect(manager.sync([], modernDom)).toHaveLength(0);
    expect(document.querySelector('[data-lowdiff-thread]')).toBeNull();
    manager.sync([finding], modernDom);
    manager.clear();
    expect(document.querySelector('[data-lowdiff-thread]')).toBeNull();
  });
});
