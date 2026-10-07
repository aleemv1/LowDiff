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
.chat-panel {
  transform: translateX(100%); visibility: hidden; pointer-events: none;
  transition: transform 280ms cubic-bezier(.22,.61,.36,1), visibility 0s linear 280ms;
}
.chat-panel.is-open {
  transform: translateX(0); visibility: visible; pointer-events: auto;
  transition: transform 280ms cubic-bezier(.22,.61,.36,1), visibility 0s;
}

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
.chat-composer { border: 1px solid var(--ld-accent-border); }
.chat-composer:focus-within { border-color: var(--ld-accent); }
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

/* A1: one small, horizontal dock; the jump list appears only on request. */
.annotation-dock {
  --ld-dock-surface: color-mix(in srgb, var(--ld-accent) 8%, var(--ld-surface));
  --ld-dock-border: color-mix(in srgb, var(--ld-accent) 35%, var(--ld-surface));
  --ld-dock-selection: color-mix(in srgb, var(--ld-accent) 10%, var(--ld-surface));
  position: fixed; left: 50%; bottom: max(24px, env(safe-area-inset-bottom));
  transform: translateX(-50%); z-index: 2147483001; width: max-content;
  max-width: calc(100vw - 32px); display: block; margin: 0; padding: 0; border: 0;
  transition: left 280ms cubic-bezier(.22,.61,.36,1);
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--ld-fg);
}
.annotation-dock-bar {
  display: flex; align-items: center; gap: 6px; padding: 7px 9px;
  background: var(--ld-dock-surface); border: 1px solid var(--ld-dock-border); border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,.14);
}
.annotation-dock-mark {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 34px; height: 34px; padding: 6px; margin: 0;
  color: var(--ld-accent); background: transparent; border: 0; border-radius: 6px; cursor: pointer;
  transition: background-color 140ms ease, box-shadow 140ms ease;
}
.annotation-dock-mark:hover { background: var(--ld-dock-selection); }
.annotation-dock-mark[aria-expanded=true] {
  background: color-mix(in srgb, var(--ld-accent) 16%, var(--ld-surface));
  color: var(--ld-accent-strong);
  box-shadow: inset 0 1px 3px color-mix(in srgb, var(--ld-accent) 28%, transparent),
    inset 0 0 0 1px var(--ld-dock-border);
}
.annotation-dock-mark svg { display: block; transition: transform 140ms ease; }
.annotation-dock-mark[aria-expanded=true] svg, .annotation-dock-mark:active svg { transform: translateY(1px) scale(.92); }
.annotation-star-sheen { opacity: 0; pointer-events: none; }
.annotation-dock-mark::before, .annotation-dock-mark::after {
  content: ''; position: absolute; width: 7px; height: 7px; top: 2px; right: 1px;
  background: currentColor; pointer-events: none; opacity: 0; transform: scale(.3);
  clip-path: polygon(50% 0%, 63% 37%, 100% 50%, 63% 63%, 50% 100%, 37% 63%, 0% 50%, 37% 37%);
}
.annotation-dock-mark::after { width: 5px; height: 5px; top: auto; right: auto; bottom: 3px; left: 1px; }
.annotation-dock-mark:is(:hover, :focus-visible) svg {
  animation: annotation-star-glow 900ms ease-out;
}
.annotation-dock-mark:is(:hover, :focus-visible) .annotation-star-sheen {
  animation: annotation-star-shine 900ms cubic-bezier(.22,.61,.36,1);
}
.annotation-dock-mark:is(:hover, :focus-visible)::before,
.annotation-dock-mark:is(:hover, :focus-visible)::after {
  animation: annotation-star-glitter 650ms ease-out 120ms;
}
.annotation-dock-mark:is(:hover, :focus-visible)::after { animation-delay: 320ms; }
@keyframes annotation-star-glow {
  0%, 100% { filter: brightness(1) drop-shadow(0 0 0 transparent); }
  35% { filter: brightness(1.25) drop-shadow(0 0 4px var(--ld-accent)); }
}
@keyframes annotation-star-shine {
  0% { opacity: 0; transform: translateX(0); }
  15%, 65% { opacity: 1; }
  100% { opacity: 0; transform: translateX(36px); }
}
@keyframes annotation-star-glitter {
  0%, 100% { opacity: 0; transform: scale(.3); }
  35% { opacity: 1; transform: scale(1); }
}
.annotation-dock-button {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  min-width: 34px; min-height: 34px; padding: 6px; margin: 0;
  font: inherit; color: var(--ld-fg); background: var(--ld-surface);
  border: 1px solid var(--ld-dock-border); border-radius: 6px; cursor: pointer;
}
.annotation-dock-button:not(:disabled):hover { background: var(--ld-dock-selection); }
.annotation-dock-count { gap: 8px; padding: 6px 10px; white-space: nowrap; font-variant-numeric: tabular-nums; border-color: var(--ld-accent); color: var(--ld-accent-strong); }
.annotation-dock-count[aria-expanded=true] { background: var(--ld-surface); box-shadow: inset 0 0 0 1px var(--ld-dock-border); }
.annotation-dock-progress { display: flex; align-items: center; gap: 7px; white-space: nowrap; padding: 0 4px; color: var(--ld-fg-muted); font-size: 12px; }
.annotation-dock-button + .annotation-dock-progress { border-left: 1px solid var(--ld-border); padding-left: 11px; margin-left: 2px; }
.annotation-spinner { width: 16px; height: 16px; flex: none; border: 2px solid var(--ld-border); border-top-color: var(--ld-accent); border-radius: 50%; animation: annotation-spin 1s linear infinite; }
@keyframes annotation-spin { to { transform: rotate(360deg); } }
@media(prefers-reduced-motion: reduce) {
  .chat-panel, .chat-panel.is-open, .annotation-dock { transition: none; }
  .annotation-dock-mark, .annotation-dock-mark svg { transition: none; }
  .annotation-spinner, .annotation-dock-mark:is(:hover, :focus-visible) svg,
  .annotation-dock-mark:is(:hover, :focus-visible) .annotation-star-sheen,
  .annotation-dock-mark:is(:hover, :focus-visible)::before,
  .annotation-dock-mark:is(:hover, :focus-visible)::after { animation: none; }
}
.annotation-jump-menu {
  position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%);
  width: min(360px, calc(100vw - 32px)); max-height: min(480px, calc(100dvh - 140px));
  display: flex; flex-direction: column; overflow: hidden; padding: 7px;
  background: var(--ld-surface); border: 1px solid var(--ld-border); border-radius: 10px;
  box-shadow: 0 6px 28px rgba(0,0,0,.16);
}
.annotation-jump-heading { display: flex; align-items: baseline; gap: 9px; padding: 8px 10px 11px; }
.annotation-jump-heading strong { font-weight: 650; }
.annotation-jump-heading > span { color: var(--ld-fg-muted); font-size: 12px; }
.annotation-jump-list { list-style: none; margin: 0; padding: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.annotation-jump-row {
  display: flex; align-items: center; gap: 10px; width: 100%; margin: 0; padding: 10px;
  border: 0; border-radius: 5px; background: transparent; text-align: left;
  color: var(--ld-fg); font: inherit; cursor: pointer;
}
.annotation-jump-row:not(:disabled):hover { background: var(--ld-surface-muted); }
.annotation-jump-row[aria-current=true] { background: var(--ld-dock-selection); box-shadow: inset 3px 0 var(--ld-accent); }
.annotation-jump-row:disabled { opacity: .7; cursor: default; }
.annotation-kind-icon { flex: none; }
.annotation-jump-copy { display: flex; flex-direction: column; min-width: 0; gap: 2px; padding: 0; }
.annotation-jump-title { display: block; overflow-wrap: anywhere; padding: 0; }
.annotation-jump-source { display: block; font-size: 11px; color: var(--ld-fg-muted); overflow-wrap: anywhere; padding: 0; }
.annotation-unavailable { margin-left: auto; flex: none; padding: 2px 5px; border-radius: 4px; font-size: 10px; color: var(--ld-fg-muted); background: var(--ld-surface-muted); }
.annotation-jump-hint { font-size: 11px; color: var(--ld-fg-muted); padding: 8px 10px 4px; margin: 0; border-top: 1px solid var(--ld-border); }
.annotation-dock button:focus-visible { outline: 2px solid var(--ld-accent); outline-offset: -2px; }
@media(min-width: 1000px) { .annotation-dock.with-chat { left: calc(50% - 200px); } }
@media(max-width: 999px) { .annotation-dock.with-chat { display: none; } }
@media(max-width: 380px) {
  .annotation-dock-bar { gap: 4px; padding: 6px; }
  .annotation-dock-mark { padding: 0 2px; }
  .annotation-dock-count { padding: 6px; gap: 4px; }
  .annotation-dock-progress { font-size: 11px; gap: 4px; }
  .annotation-dock-button + .annotation-dock-progress { padding-left: 6px; }
}
`;
