import type { MarkId } from "./theme";

export type MarkSource = { src: string; srcSet?: string };

// The rendered box is 48px above 900px and 32px at or below it in every theme
// (theme-switcher Invariant 3). Only the image changes.
export type ThemeMark = { header48: MarkSource; header32: MarkSource };

function densities(base: string): MarkSource {
  return { src: `${base}.png`, srcSet: `${base}.png 1x, ${base}@2x.png 2x, ${base}@3x.png 3x` };
}

// Typed on MarkId, so registering a theme whose mark has no assets fails tsc.
export const THEME_MARKS: Record<MarkId, ThemeMark> = {
  // One SVG serves both sizes: it only ever scales by the integer factors the
  // logo spec's Req 1.2 allows (16px grid at 48 and 32).
  "pixel-reticle": {
    header48: { src: "/reticle-mark.svg" },
    header32: { src: "/reticle-mark.svg" },
  },
  // Rendered natively at each size with its glow baked in, never scaled from
  // another export (theme-switcher Requirement 6), so each size has its own
  // density set.
  "neon-reticle": {
    header48: densities("/blade-runner-mark-48"),
    header32: densities("/blade-runner-mark-32"),
  },
};
