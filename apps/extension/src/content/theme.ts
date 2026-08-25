/**
 * Colours resolve to GitHub's own Primer custom properties.
 *
 * Custom properties are not reset by `all: initial` and do inherit through a
 * shadow boundary, so reading GitHub's variables means the overlay follows
 * whatever theme the user has set — including their dark and colourblind
 * variants — without us detecting anything. Each has a light-mode fallback for
 * the dev harness, where no GitHub stylesheet is present.
 *
 * The accent stays ours: it is the one thing that should read as LowDiff
 * rather than as GitHub chrome.
 */
export const C = {
  accent: 'var(--ld-accent)',
  accentDark: 'var(--ld-accent-strong)',
  accentTint: 'var(--ld-accent-tint)',
  accentBorder: 'var(--ld-accent-border)',
  accentSoft: 'var(--ld-accent-soft)',
  ink: 'var(--ld-fg)',
  body: 'var(--ld-fg)',
  muted: 'var(--ld-fg-muted)',
  faint: 'var(--ld-fg-faint)',
  line: 'var(--ld-border)',
  surface: 'var(--ld-surface)',
  page: 'var(--ld-surface-muted)',
  addBg: 'var(--ld-add-bg)',
  addNum: 'var(--ld-add-bg)',
  delBg: 'var(--ld-del-bg)',
  delNum: 'var(--ld-del-bg)',
  ghInk: 'var(--ld-fg)',
  ghMuted: 'var(--ld-fg-muted)',
} as const;

export const KIND_STYLE: Record<string, { color: string; headBg: string }> = {
  RISK: { color: 'var(--ld-danger-fg)', headBg: 'var(--ld-danger-bg)' },
  SECURITY: { color: 'var(--ld-danger-fg)', headBg: 'var(--ld-danger-bg)' },
  BREAKING: { color: 'var(--ld-warn-fg)', headBg: 'var(--ld-warn-bg)' },
  PERF: { color: 'var(--ld-info-fg)', headBg: 'var(--ld-info-bg)' },
  // Not --ld-surface-muted: on GitHub's dark themes that resolves to almost
  // the card surface, leaving the "note" chip invisible next to coloured ones.
  EXPLAIN: { color: 'var(--ld-fg-muted)', headBg: 'var(--ld-note-bg)' },
  SUGGESTION: { color: 'var(--ld-ok-fg)', headBg: 'var(--ld-ok-bg)' },
};

export const STYLES = `
:host {
  all: initial;

  --ld-accent: #7c7cf0;
  --ld-accent-strong: #9a9af5;
  --ld-accent-tint: var(--bgColor-accent-muted, rgba(124,124,240,.10));
  --ld-accent-border: var(--borderColor-accent-muted, rgba(124,124,240,.35));
  --ld-accent-soft: var(--bgColor-accent-muted, rgba(124,124,240,.16));

  --ld-surface: var(--bgColor-default, #ffffff);
  --ld-surface-muted: var(--bgColor-muted, #f6f8fa);
  --ld-fg: var(--fgColor-default, #1f2328);
  --ld-fg-muted: var(--fgColor-muted, #59636e);
  --ld-fg-faint: var(--fgColor-muted, #818b98);
  --ld-border: var(--borderColor-default, #d1d9e0);

  --ld-danger-fg: var(--fgColor-danger, #c4362a);
  --ld-danger-bg: var(--bgColor-danger-muted, #fff1ef);
  --ld-warn-fg: var(--fgColor-attention, #9a6700);
  --ld-warn-bg: var(--bgColor-attention-muted, #fff7e8);
  --ld-info-fg: var(--fgColor-accent, #0969da);
  --ld-info-bg: var(--bgColor-accent-muted, #eaf4ff);
  --ld-ok-fg: var(--fgColor-success, #1a7f37);
  --ld-ok-bg: var(--bgColor-success-muted, #e9f8ec);
  /* Mid-gray at low alpha reads as a tint on light and dark alike. */
  --ld-note-bg: rgba(139,148,158,.16);

  --ld-add-bg: var(--diffBlob-additionNum-bgColor, #aceebb);
  --ld-del-bg: var(--diffBlob-deletionNum-bgColor, #ffcecb);
}

/*
 * GitHub's light themes need a darker accent than its dark themes; the light
 * fallbacks above are tuned for dark, so correct them when the page is light.
 */
@media (prefers-color-scheme: light) {
  :host { --ld-accent: #5b5bd6; --ld-accent-strong: #4a4ac2; }
}

* { box-sizing: border-box; }

.root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  color: var(--ld-fg);
  margin: 0 0 20px;
  /*
   * The note popover is positioned in coordinates relative to this element,
   * so it has to actually be the containing block. Without position:relative
   * the browser resolves against the body and every popover is offset by
   * whatever GitHub renders to the left of us.
   */
  position: relative;
}

@keyframes notePop { from { opacity: 0; transform: translateY(-6px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes chatUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }

.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.pill { border-radius: 999px; padding: 3px 10px; font: 600 10.5px inherit; }

.btn {
  border-radius: 999px; padding: 6px 14px; cursor: pointer; border: none;
  font: 600 11.5px inherit; font-family: inherit;
}
.btn-primary { background: var(--ld-accent); color: #fff; }
.btn-primary:hover { background: var(--ld-accent-strong); }
.btn-ghost { background: var(--ld-surface-muted); color: var(--ld-fg-muted); }
.btn-ghost:hover { filter: brightness(1.15); }

.scroll { overflow-y: auto; }
`;
