/**
 * The brand mark as geometry instead of the ✦ glyph, which is font-rendered
 * and draws differently — off-centre, wrong weight — depending on the
 * viewer's system fonts. One SVG path, crisp at any size, themed by
 * currentColor.
 */
export const SPARKLE_PATH =
  'M8 0C8.9 4.5 11.5 7.1 16 8 11.5 8.9 8.9 11.5 8 16 7.1 11.5 4.5 8.9 0 8 4.5 7.1 7.1 4.5 8 0Z';

export function Sparkle({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      <path d={SPARKLE_PATH} fill="currentColor" />
    </svg>
  );
}

/** Markup string for plain-DOM call sites (the badge injector). */
export const SPARKLE_SVG = `<svg viewBox="0 0 16 16" width="9" height="9" aria-hidden="true" style="display:block"><path d="${SPARKLE_PATH}" fill="currentColor"/></svg>`;
