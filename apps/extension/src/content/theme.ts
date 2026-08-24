/** Palette lifted from the design mockup so the built UI matches it exactly. */
export const C = {
  accent: '#5b5bd6',
  accentDark: '#4a4ac2',
  accentTint: '#f4f3fd',
  accentBorder: '#ddd9f6',
  accentSoft: '#eceafd',
  ink: '#2a2a4a',
  body: '#3d4451',
  muted: '#5a6472',
  faint: '#98a1ae',
  line: '#e4e8ef',
  surface: '#ffffff',
  page: '#eef1f6',
  addBg: '#dafbe1',
  addNum: '#aceebb',
  delBg: '#ffebe9',
  delNum: '#ffcecb',
  ghInk: '#1f2328',
  ghMuted: '#656d76',
} as const;

export const KIND_STYLE: Record<string, { color: string; headBg: string }> = {
  RISK: { color: '#c4362a', headBg: '#fff1ef' },
  SECURITY: { color: '#c4362a', headBg: '#fff1ef' },
  BREAKING: { color: '#9a6700', headBg: '#fff7e8' },
  PERF: { color: '#0969da', headBg: '#eaf4ff' },
  EXPLAIN: { color: '#5a6472', headBg: '#eef1f6' },
  SUGGESTION: { color: '#1a7f37', headBg: '#e9f8ec' },
};

export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  font-family: 'DM Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
  color: ${C.body};
  margin: 0 0 20px;
  /* Containing block for the note popover. Without this the popover resolves
     against whichever ancestor GitHub happens to position, and lands offset by
     that element's page offset. */
  position: relative;
}
@keyframes notePop { from { opacity: 0; transform: translateY(-6px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes chatUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(91,91,214,.35) }
  50% { box-shadow: 0 0 0 6px rgba(91,91,214,0) }
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.badge {
  width: 18px; height: 18px; border-radius: 50%;
  border: 1.5px solid ${C.accent}; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font: 700 10px 'DM Sans', sans-serif; animation: pulse 2.4s infinite;
}
.badge:hover { transform: scale(1.25); }
.pill { border-radius: 999px; padding: 3px 10px; font: 600 10.5px 'DM Sans', sans-serif; }
.btn {
  border-radius: 999px; padding: 6px 14px; cursor: pointer; border: none;
  font: 600 11.5px 'DM Sans', sans-serif;
}
.btn-primary { background: ${C.accent}; color: #fff; }
.btn-primary:hover { background: ${C.accentDark}; }
.btn-ghost { background: ${C.page}; color: ${C.muted}; }
.btn-ghost:hover { background: #e2e7ee; }
.scroll { overflow-y: auto; }
`;
