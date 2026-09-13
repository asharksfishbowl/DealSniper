import type { ColorRole, FontId, Theme, ThemeGlow, WebLabelSlot } from "./theme";

// Colour roles with no CSS consumer. They are applied inline from TSX
// (deltaColor, tickerLineFor), so declaring a custom property for them would
// look authoritative while changing nothing on the board.
// specs/blade-runner-reskin/design-blade-runner-reskin.md Requirement 19b.
const TS_ONLY_ROLES: ReadonlySet<ColorRole> = new Set<ColorRole>([
  "stateGain",
  "stateGainDim",
  "stateMid",
  "stateLoss",
  "stateLive",
  "stateCached",
  "accentTertiary",
]);

// Retailer keys are bare in TypeScript but --brand-<key> in CSS (Requirement 20).
const BRAND_KEYS: ReadonlySet<ColorRole> = new Set<ColorRole>([
  "amazon",
  "costco",
  "walmart",
  "homedepot",
  "ebay",
]);

// A closed set, not "whatever needs one": exactly the roles that appear in an
// alpha context or as a glow colour (Requirement 11). The hex stays the single
// literal; the channel triplet is computed from it.
const RGB_COMPANION_ROLES: readonly ColorRole[] = [
  "accentPrimary",
  "surfaceRaised",
  "amazon",
  "textLabel",
  "stateStandout",
];

// Full CSS stacks per slot. The fallbacks are the ones each slot declared
// before theming, so Retro Arcade resolves to exactly its old font-family
// strings.
type FontSlot = "display" | "label";
const BEBAS_STACK = '"Bebas Neue", sans-serif';
const MONO_STACK = '"IBM Plex Mono", monospace';
const FONT_STACKS: Record<FontSlot, Record<FontId, string>> = {
  // Only Press Start 2P's fallback differs by slot.
  display: { pressStart2P: '"Press Start 2P", "Bebas Neue", sans-serif', bebasNeue: BEBAS_STACK, ibmPlexMono: MONO_STACK },
  label: { pressStart2P: '"Press Start 2P", "IBM Plex Mono", monospace', bebasNeue: BEBAS_STACK, ibmPlexMono: MONO_STACK },
};

function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function cssVarName(role: ColorRole): string {
  return BRAND_KEYS.has(role) ? `--brand-${kebabCase(role)}` : `--${kebabCase(role)}`;
}

function hexToChannels(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    // Fail loudly: a -rgb companion from a non-hex value would silently
    // produce an invalid colour and every wash built on it would vanish.
    throw new Error(`-rgb companion needs a #RRGGBB value, got "${hex}"`);
  }
  return match
    .slice(1)
    .map((pair) => parseInt(pair, 16))
    .join(" ");
}

export function fontStack(id: FontId, slot: FontSlot): string {
  return FONT_STACKS[slot][id];
}

// An alpha as a color-mix percentage. Plain multiplication can leak float noise
// into the stylesheet (0.29 * 100 is 28.999999999999996, 0.07 * 100 is
// 7.000000000000001). Today's alphas happen to multiply cleanly, but a theme
// shouldn't have to know that, so round to the precision alphas are authored at.
function percent(alpha: number): string {
  return `${Number((alpha * 100).toFixed(4))}%`;
}

// Each glow variable is a complete shadow value, or the keyword `none` when the
// tier is null. `none` makes the computed style literally `none`, so a theme
// without glow emits no shadow at all rather than a transparent one.
// Radii and units are fixed by Blade Runner Section E; only alphas vary.
function glowValues(glow: ThemeGlow): Record<string, string> {
  const { sign, label, interactive, standout } = glow;
  const ring = interactive ? `0 0 0 1px rgb(var(--accent-primary-rgb) / ${interactive.ring})` : "none";
  return {
    // Req 39: the wordmark, two em-based stops on the accent triplet.
    "--glow-sign": sign
      ? `0 0 0.5em rgb(var(--accent-primary-rgb) / ${sign.inner}), 0 0 1.5em rgb(var(--accent-primary-rgb) / ${sign.outer})`
      : "none",
    // Req 42: .ticker-line's colour is set inline at runtime, so no -rgb triplet
    // can serve it. It takes the Sign tier's alphas from currentColor instead.
    "--glow-ticker": sign
      ? `0 0 0.5em color-mix(in srgb, currentColor ${percent(sign.inner)}, transparent), 0 0 1.5em color-mix(in srgb, currentColor ${percent(sign.outer)}, transparent)`
      : "none",
    // Req 40: one stop. A second stop at label sizes is a smear, not a glow.
    "--glow-label": label ? `0 0 0.6em rgb(var(--text-label-rgb) / ${label.alpha})` : "none",
    // Req 41: rem, because buttons don't scale with viewport.
    "--glow-interactive": interactive
      ? `${ring}, 0 0 0.75rem rgb(var(--accent-primary-rgb) / ${interactive.halo})`
      : "none",
    // Req 44: under prefers-contrast only the ring survives. It's a focus
    // affordance, not glow.
    "--glow-interactive-ring": ring,
    // Req 43: a halo on the chip's border, never on the numeral inside it.
    "--glow-standout": standout ? `0 0 0.5rem rgb(var(--state-standout-rgb) / ${standout.alpha})` : "none",
  };
}

/** Writes a theme onto :root as CSS custom properties. Every themed rule reads from these. */
export function applyTheme(theme: Theme): void {
  const rootStyle = document.documentElement.style;

  for (const role of Object.keys(theme.colors) as ColorRole[]) {
    if (TS_ONLY_ROLES.has(role)) continue;
    rootStyle.setProperty(cssVarName(role), theme.colors[role]);
  }

  for (const role of RGB_COMPANION_ROLES) {
    rootStyle.setProperty(`${cssVarName(role)}-rgb`, hexToChannels(theme.colors[role]));
  }

  const { display, label } = theme.type;
  rootStyle.setProperty("--font-display", fontStack(display.family, "display"));
  rootStyle.setProperty("--display-scale", String(display.scale));
  rootStyle.setProperty("--tracking-display", display.tracking.web);

  rootStyle.setProperty("--font-label", fontStack(label.family, "label"));
  rootStyle.setProperty("--font-label-weight", String(label.weight));
  rootStyle.setProperty("--font-label-transform", label.transform);
  // Iterates the theme's own Record<WebLabelSlot, string>, so a new slot is
  // covered as soon as the type requires every theme to set it.
  for (const slot of Object.keys(label.tracking.web) as WebLabelSlot[]) {
    rootStyle.setProperty(`--tracking-${kebabCase(slot)}`, label.tracking.web[slot]);
  }

  for (const [name, value] of Object.entries(glowValues(theme.glow))) {
    rootStyle.setProperty(name, value);
  }

  rootStyle.setProperty("--overlay-opacity", String(theme.overlay.opacity));
}

