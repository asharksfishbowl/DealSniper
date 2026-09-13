// Theme registry. This file is a byte-for-byte twin of mobile/src/theme.ts
// (checked with `cmp`), so it must import nothing from either platform.
//
// Role names follow specs/blade-runner-reskin/design-blade-runner-reskin.md
// Section A, in that section's order. CSS names come from these by a mechanical
// camelCase -> --kebab-case transform (Requirement 19), except the retailer
// keys below.

export type ThemeId = "retro-arcade";

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

export type Theme = {
  id: ThemeId;
  label: string;
  colors: ThemeColors;
};

const RETRO_ARCADE: Theme = {
  id: "retro-arcade",
  label: "RETRO ARCADE",
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
};

export const THEMES: readonly Theme[] = [RETRO_ARCADE];

export const DEFAULT_THEME_ID: ThemeId = "retro-arcade";

/** Looks up a registered theme. Throws only if THEMES and ThemeId have drifted apart. */
export function getTheme(id: ThemeId): Theme {
  const theme = THEMES.find((candidate) => candidate.id === id);
  if (!theme) {
    throw new Error(`Theme "${id}" is not registered in THEMES`);
  }
  return theme;
}

export const THEME_STORAGE_KEY = "dealsniper_theme_v1";
