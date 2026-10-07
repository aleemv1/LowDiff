import type { Note, NoteKind } from '@lowdiff/core';
import type { DiffDom } from './dom/index.js';
import { noteKey } from './annotate.js';
import { STYLES } from './theme.js';

export interface InlineSlot {
  key: string;
  note: Note;
  row: HTMLTableRowElement;
  container: HTMLDivElement;
}

export class InlineNotes {
  private slots = new Map<string, InlineSlot>();

  /** Reuse shadow containers so drafts and streams survive GitHub redraws. */
  sync(notes: readonly Note[], dom: DiffDom, hiddenKinds: readonly NoteKind[] = []): InlineSlot[] {
    const wanted = new Set(notes.map(noteKey));
    for (const [key, slot] of this.slots) {
      if (wanted.has(key)) continue;
      slot.row.remove();
      this.slots.delete(key);
    }

    const lines = new Map<string, ReturnType<DiffDom['lines']>>();
    const tails = new Map<HTMLElement, HTMLElement>();
    for (const note of notes) {
      const key = noteKey(note);
      let slot = this.slots.get(key);
      if (hiddenKinds.includes(note.kind)) {
        slot?.row.remove();
        continue;
      }
      let fileLines = lines.get(note.anchor.path);
      if (!fileLines) {
        fileLines = dom.lines(note.anchor.path);
        lines.set(note.anchor.path, fileLines);
      }
      const anchor = fileLines.find(l => l.side === note.anchor.side && l.line === note.anchor.line);
      if (!anchor) {
        // A collapsed/virtualized file may return later. Keep its component
        // mounted in a detached container until the line is rendered again.
        slot?.row.remove();
        continue;
      }
      const last = fileLines.filter(l => l.side === note.anchor.side &&
        l.line >= note.anchor.line && l.line <= (note.anchor.endLine ?? note.anchor.line))
        .sort((a, b) => b.line - a.line)[0] ?? anchor;
      const codeRow = last.row.closest('tr');
      if (!(codeRow instanceof HTMLTableRowElement)) continue;

      if (!slot) {
        const row = document.createElement('tr');
        row.setAttribute('data-lowdiff-thread', key);
        const cell = document.createElement('td');
        Object.assign(cell.style, {
          padding: '8px 12px 8px 40px', whiteSpace: 'normal',
          background: 'var(--bgColor-default, #fff)', verticalAlign: 'top',
        });
        const host = document.createElement('div');
        host.style.cssText = 'display:block; min-width:0; max-width:100%; container-type:inline-size;';
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = STYLES;
        const container = document.createElement('div');
        shadow.append(style, container);
        cell.append(host);
        row.append(cell);
        slot = { key, note, row, container };
        this.slots.set(key, slot);
      }
      slot.note = note;
      slot.row.cells[0]!.colSpan = [...codeRow.cells].reduce((sum, cell) => sum + cell.colSpan, 0);
      const after = tails.get(codeRow) ?? codeRow;
      if (after.nextElementSibling !== slot.row) after.after(slot.row);
      tails.set(codeRow, slot.row);
    }
    return [...this.slots.values()];
  }

  clear(): void {
    for (const slot of this.slots.values()) slot.row.remove();
    this.slots.clear();
  }
}
