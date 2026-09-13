// Theme registry. This file is a byte-for-byte twin of mobile/src/theme.ts
// (checked with `cmp`), so it must import nothing from either platform.
//
// Role names follow specs/blade-runner-reskin/design-blade-runner-reskin.md
// Section A, in that section's order. CSS names come from these by a mechanical
// camelCase -> --kebab-case transform (Requirement 19), except the retailer
// keys below.
//
// The contract is specs/theme-switcher/design-theme-switcher.md Requirement 2.
// Every field is required, so a theme missing one fails the type check instead
// of rendering half-themed.

export type ThemeId = "retro-arcade" | "blade-runner";

export type ColorRole =
  // surface
  | "surfaceDeep"
  | "surfaceRaised"
  | "surfaceInset"
  | "surfaceHover"
  | "surfaceSelected"
  | "surfaceBloom"
  | "surfaceDeepTop"
  | "surfaceDeepBottom"
  | "surfaceScrimCart"
  | "surfaceScrimPrefs"
  // line
  | "lineHairline"
  | "lineRow"
  | "lineAccent"
  | "lineDanger"
  // text
  | "textPrimary"
  | "textSecondary"
  | "textLabel"
  // accent
  | "accentPrimary"
  | "accentPrimaryInk"
  | "accentSecondary"
  | "accentTertiary"
  // state
  | "stateGain"
  | "stateGainDim"
  | "stateMid"
  | "stateLoss"
  | "stateLive"
  | "stateCached"
  | "stateDemo"
  | "stateDemoInk"
  | "stateStandout"
  | "actionDestructive"
  | "numChipBg"
  // brand
  | "amazon"
  | "costco"
  | "walmart"
  | "homedepot"
  | "ebay"
  // depth shadow (occlusion, not glow)
  | "shadowDepth"
  | "shadowDepthSoft";

export type ThemeColors = Record<ColorRole, string>;

// Platform-neutral font ids. Each platform maps them to its own family names
// (CSS stacks on web, expo-font keys on mobile), because the two name the same
// font differently.
export type FontId = "pressStart2P" | "bebasNeue" | "ibmPlexMono";

export type FontWeight = 400 | 500 | 700;

// The four label slots, named per platform (Requirement 2.2).
export type WebLabelSlot = "numLabel" | "boardHead" | "tickerLine" | "tapeLabel";
export type MobileLabelSlot = "colSym" | "colPx" | "tickerLine" | "tapeLabel";

// Which logo a theme shows. Each platform maps a MarkId to its own assets.
export type MarkId = "pixel-reticle" | "neon-reticle";

export type ThemeType = {
  display: {
    family: FontId;
    weight: FontWeight;
    // Multiplier on the authored wordmark size. Line height divides by the
    // same factor, so the wordmark's line box is identical in every theme.
    scale: number;
    tracking: { web: string; mobile: number };
  };
  label: {
    family: FontId;
    weight: FontWeight;
    transform: "none" | "uppercase";
    tracking: { web: Record<WebLabelSlot, string>; mobile: Record<MobileLabelSlot, number> };
  };
};

// A tier set to null emits no shadow at all, never a zero-alpha one
// (Requirement 2.4). Only strengths live here; radii and units are fixed by the
// Blade Runner spec's Section E and do not vary per theme.
export type ThemeGlow = {
  sign: { inner: number; outer: number } | null;
  label: { alpha: number } | null;
  interactive: { ring: number; halo: number } | null;
  standout: { alpha: number } | null;
};

export type Theme = {
  id: ThemeId;
  // Switcher text, ASCII caps. Never persisted, so renaming it orphans nothing.
  label: string;
  // Nested under `type` because the spec's `label` type group would otherwise
  // collide with the `label` string above.
  type: ThemeType;
  colors: ThemeColors;
  glow: ThemeGlow;
  overlay: { opacity: number };
  markId: MarkId;
};

const RETRO_ARCADE: Theme = {
  id: "retro-arcade",
  label: "RETRO ARCADE",
  type: {
    display: {
      family: "pressStart2P",
      weight: 400,
      scale: 1,
      tracking: { web: "0.02em", mobile: 1 },
    },
    label: {
      family: "pressStart2P",
      weight: 400,
      transform: "none",
      tracking: {
        web: { numLabel: "0.06em", boardHead: "0.04em", tickerLine: "0.04em", tapeLabel: "0.06em" },
        mobile: { colSym: 0.5, colPx: 0.5, tickerLine: 0.5, tapeLabel: 0.5 },
      },
    },
  },
  colors: {
    surfaceDeep: "#0B0F0C",
    surfaceRaised: "#121916",
    surfaceInset: "#0E1411",
    surfaceHover: "#122016",
    surfaceSelected: "#122016",
    surfaceBloom: "#152019",
    surfaceDeepTop: "#0D1210",
    surfaceDeepBottom: "#0A0E0B",
    surfaceScrimCart: "rgba(4, 7, 5, 0.75)",
    surfaceScrimPrefs: "rgba(0, 0, 0, 0.55)",

    lineHairline: "#1E2A22",
    lineRow: "#162018",
    lineAccent: "#2E5036",
    lineDanger: "#4B2828",

    textPrimary: "#E8F0E9",
    textSecondary: "#7A8F7E",
    textLabel: "#4A5C4E",

    accentPrimary: "#2EE56A",
    accentPrimaryInk: "#0B0F0C",
    accentSecondary: "#D4A84B",
    // applied inline in TSX; deliberately no CSS variable.
    accentTertiary: "#C45BC4",

    // applied inline in TSX; deliberately no CSS variable.
    stateGain: "#2EE56A",
    stateGainDim: "#1A8F42",
    stateMid: "#D4A84B",
    stateLoss: "#C45B5B",
    stateLive: "#4BD4D4",
    stateCached: "#C45BC4",

    stateDemo: "#D4A84B",
    stateDemoInk: "#0B0F0C",
    stateStandout: "#4BD4D4",
    actionDestructive: "#C45B5B",
    numChipBg: "#121916",

    // Retailer keys stay bare, not role-prefixed: retailerColor() indexes these
    // colours with the retailer string the API sends, so a prefixed key would
    // silently fall back to textSecondary with no error. CSS names them
    // --brand-<key>, because CSS has no such lookup and the prefix marks them
    // as a closed, externally owned set.
    amazon: "#E8A317",
    costco: "#4A9FD4",
    walmart: "#5B9BD5",
    homedepot: "#E07A3D",
    // Violet, not an eBay brand colour: all four of eBay's brand colours collide
    // with a token already here (red #E53238 vs red, blue #0064D2 vs costco and
    // walmart, yellow #F5AF02 vs amazon and amber, green #86B817 vs green), and
    // costco/walmart are already hard to tell apart. Violet was the open hue.
    ebay: "#9B7ADF",

    shadowDepth: "rgba(0, 0, 0, 0.45)",
    shadowDepthSoft: "rgba(0, 0, 0, 0.35)",
  },
  glow: { sign: null, label: null, interactive: null, standout: null },
  overlay: { opacity: 0.07 },
  markId: "pixel-reticle",
};

const BLADE_RUNNER: Theme = {
  id: "blade-runner",
  label: "BLADE RUNNER",
  type: {
    display: {
      family: "bebasNeue",
      weight: 400,
      // Press Start 2P caps are 0.875em of ink, Bebas Neue's 0.70em:
      // 0.875 / 0.70 = 1.25 gives equal cap height (theme-switcher D6).
      scale: 1.25,
      tracking: { web: "0.12em", mobile: 2.4 },
    },
    label: {
      family: "ibmPlexMono",
      weight: 500,
      transform: "uppercase",
      tracking: {
        web: { numLabel: "0.16em", boardHead: "0.16em", tickerLine: "0.16em", tapeLabel: "0.16em" },
        // 0.16em at mobile's 9pt label size.
        mobile: { colSym: 1.44, colPx: 1.44, tickerLine: 1.44, tapeLabel: 1.44 },
      },
    },
  },
  colors: {
    // "Wet black": the Retro Arcade surfaces hue-rotated to ~205deg at constant
    // value, each within the Req 27 contrast bound (roadmap §4.1).
    surfaceDeep: "#080B0E",
    surfaceRaised: "#101619",
    surfaceInset: "#0C1115",
    surfaceHover: "#0F1C28",
    surfaceSelected: "#0F1C28",
    surfaceBloom: "#121D25",
    surfaceDeepTop: "#0B0E12",
    surfaceDeepBottom: "#070A0C",
    surfaceScrimCart: "rgba(4, 7, 5, 0.75)",
    surfaceScrimPrefs: "rgba(0, 0, 0, 0.55)",

    lineHairline: "#1C2630",
    lineRow: "#141C24",
    lineAccent: "#284A66",
    // Kept, not rotated (user decision, roadmap Q-D): a navy border would sit
    // around the red CLEAR text.
    lineDanger: "#4B2828",

    textPrimary: "#E8F0E9",
    textSecondary: "#7A8F7E",
    textLabel: "#4A5C4E",

    accentPrimary: "#4BD4D4",
    // Re-derived against its own chip, never carried from the page (Req 9a):
    // #0B0F0C and #080B0E both fall below Retro Arcade's 11.520 on cyan;
    // #000000 reaches 11.667.
    accentPrimaryInk: "#000000",
    accentSecondary: "#D4A84B",
    // applied inline in TSX; deliberately no CSS variable.
    accentTertiary: "#C45BC4",

    // applied inline in TSX; deliberately no CSS variable.
    stateGain: "#2EE56A",
    stateGainDim: "#1A8F42",
    stateMid: "#D4A84B",
    stateLoss: "#C45B5B",
    stateLive: "#4BD4D4",
    stateCached: "#C45BC4",

    stateDemo: "#C45BC4",
    // Req 9a's "no worse than today" cannot hold on this chip: Retro Arcade's
    // demo ink measures 8.735, and even #000000 on magenta #C45BC4 reaches only
    // 5.641. Accepted by the user at WCAG AA (roadmap Q-C, Edge Case 6).
    stateDemoInk: "#000000",
    stateStandout: "#4BD4D4",
    actionDestructive: "#C45B5B",
    numChipBg: "#101619",

    // Retailer keys stay bare, not role-prefixed: retailerColor() indexes these
    // colours with the retailer string the API sends, so a prefixed key would
    // silently fall back to textSecondary with no error. CSS names them
    // --brand-<key>, because CSS has no such lookup and the prefix marks them
    // as a closed, externally owned set.
    //
    // Accepted shortfall (user decision, roadmap Q-B): amazon vs accentSecondary
    // measures dE00 6.6, below the Req 52 retailer-to-accent floor of 20. Amber
    // was kept rather than moving accentSecondary to khaki.
    amazon: "#E8A317",
    // Passes the Req 52 floors, but thinly: dE00 15.6 vs walmart (floor 15),
    // min accent 25.0, text contrast 4.58 on surfaceDeep. Any change must
    // re-clear the full matrix (roadmap §4.3), so don't nudge it.
    costco: "#2D849A",
    walmart: "#5B9BD5",
    homedepot: "#E07A3D",
    // Re-picked from #9B7ADF, which would sit between cyan chrome and magenta
    // state and collide worse (Req 51).
    ebay: "#7B5FC4",

    shadowDepth: "rgba(0, 0, 0, 0.45)",
    shadowDepthSoft: "rgba(0, 0, 0, 0.35)",
  },
  glow: {
    sign: { inner: 0.45, outer: 0.22 },
    label: { alpha: 0.35 },
    interactive: { ring: 0.5, halo: 0.3 },
    standout: { alpha: 0.35 },
  },
  overlay: { opacity: 0.07 },
  markId: "neon-reticle",
};

// Registry order is switcher order. Retro Arcade stays first and default.
export const THEMES: readonly Theme[] = [RETRO_ARCADE, BLADE_RUNNER];

export const DEFAULT_THEME_ID: ThemeId = "retro-arcade";

export const THEME_STORAGE_KEY = "dealsniper_theme_v1";

/** Looks up a registered theme. Throws only if THEMES and ThemeId have drifted apart. */
export function getTheme(id: ThemeId): Theme {
  const theme = THEMES.find((candidate) => candidate.id === id);
  if (!theme) {
    throw new Error(`Theme "${id}" is not registered in THEMES`);
  }
  return theme;
}

/**
 * The registered theme for a stored value, or undefined when the value is not
 * a registered id (removed theme, corrupt value, nothing stored). Callers show
 * the default in that case and must NOT overwrite the stored value
 * (Requirement 5.4), so a temporarily unregistered theme isn't discarded.
 */
export function findTheme(storedId: string | null): Theme | undefined {
  return THEMES.find((candidate) => candidate.id === storedId);
}
