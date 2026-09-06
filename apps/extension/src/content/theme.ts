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

/**
 * Soft halo in the note's own colour, so an unopened badge is visible against
 * both diff backgrounds and its kind is readable at a glance. color-mix keeps
 * it translucent while the colour itself stays a theme variable — pass a
 * variable that resolves where the element lives (Primer vars in the page,
 * --ld-* vars inside the shadow root).
 */
export function glowFor(color: string): string {
  return `0 0 0 1px color-mix(in srgb, ${color} 40%, transparent), 0 0 8px 2px color-mix(in srgb, ${color} 55%, transparent)`;
}

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
  --ld-accent-strong: color-mix(in srgb, #7c7cf0 65%, var(--ld-fg));
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
  :host { --ld-accent: #5b5bd6; }
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
@keyframes askIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes askSparkle { 0%, 100% { transform: none } 50% { transform: rotate(14deg) scale(1.25) } }
.ask { display: flex; align-items: center; gap: 10px; animation: askIn .35s cubic-bezier(.2,.7,.3,1) both; }
.ask .spark { display: inline-block; color: var(--ld-accent-strong); animation: askSparkle 1.8s ease-in-out .4s infinite; }
@media (prefers-reduced-motion: reduce) { .ask, .ask .spark { animation: none; } }
@keyframes chatUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }

.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.pill {
  display: inline-flex; align-items: center; line-height: 1;
  border-radius: 999px; padding: 5px 10px; font: 600 10.5px inherit;
}

.btn {
  border-radius: 999px; padding: 6px 14px; cursor: pointer; border: none;
  font: 600 11.5px inherit; font-family: inherit;
}
.btn-primary { background: var(--ld-accent); color: #fff; }
.btn-primary:hover { background: var(--ld-accent-strong); }
.btn-ghost { background: var(--ld-surface-muted); color: var(--ld-fg-muted); }
.btn-ghost:hover { filter: brightness(1.15); }

.scroll { overflow-y: auto; }

button:disabled { cursor: default; opacity: .5; }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--ld-accent); outline-offset: 2px; }
.inline-note { font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--ld-fg); background: var(--ld-surface); border: 1px solid var(--ld-accent-border);
  border-radius: 8px; overflow: hidden; overflow-wrap: anywhere; text-align: left; }
.inline-note-header { display: flex; align-items: center; gap: 9px; padding: 10px 12px 6px; flex-wrap: wrap; }
.inline-note-header .btn { margin-left: auto; flex: none; }
.inline-source { font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ld-fg-muted); }
.inline-note-title { font-weight: 650; padding: 0 12px 8px; }
.inline-caveat { color: var(--ld-fg-muted); font-size: 11px; padding: 0 12px 8px; }
.inline-note-body { padding: 0 12px 8px; }
.inline-link { border: 0; background: transparent; color: var(--ld-accent-strong); font: inherit;
  font-size: 12px; cursor: pointer; padding: 6px 0; text-align: left; }
.inline-message { border-top: 1px solid var(--ld-border); padding: 8px 12px; }
.inline-message > strong { font-size: 11px; }
.inline-status { padding: 8px 12px; color: var(--ld-fg-muted); font-size: 12px; }
.inline-status[role=alert] { color: var(--ld-danger-fg); }
.inline-composer { display: flex; align-items: flex-end; gap: 8px; margin: 4px 12px 0;
  padding: 5px; border: 1px solid var(--ld-border); border-radius: 6px; }
.inline-composer textarea { flex: 1; min-width: 0; width: 100%; max-height: 140px; resize: vertical;
  border: 0; background: var(--ld-surface); color: var(--ld-fg); font: inherit; padding: 4px 6px; }
.inline-note-footer { display: flex; justify-content: flex-end; padding: 2px 12px 6px; }
`;
