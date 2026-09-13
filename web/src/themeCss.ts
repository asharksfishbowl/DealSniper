import type { ColorRole, Theme } from "./theme";

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

function cssVarName(role: ColorRole): string {
  const kebab = role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return BRAND_KEYS.has(role) ? `--brand-${kebab}` : `--${kebab}`;
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

/** Writes a theme's colour roles onto :root as CSS custom properties. */
export function applyTheme(theme: Theme): void {
  const rootStyle = document.documentElement.style;

  for (const role of Object.keys(theme.colors) as ColorRole[]) {
    if (TS_ONLY_ROLES.has(role)) continue;
    rootStyle.setProperty(cssVarName(role), theme.colors[role]);
  }

  for (const role of RGB_COMPANION_ROLES) {
    rootStyle.setProperty(`${cssVarName(role)}-rgb`, hexToChannels(theme.colors[role]));
  }
}
