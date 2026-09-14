import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Platform, type TextStyle } from "react-native";

import {
  DEFAULT_THEME_ID,
  getTheme,
  type FontId,
  type FontWeight,
  type MobileLabelSlot,
  type Theme,
  type ThemeId,
} from "./theme";
import { writeStoredTheme } from "./themePersistence";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: getTheme(DEFAULT_THEME_ID),
  setTheme: () => {
    throw new Error("setTheme called outside ThemeProvider");
  },
});

const NO_GLOW: Theme["glow"] = { sign: null, label: null, interactive: null, standout: null };

// One glow-less copy per registered theme, built on first use and then reused,
// so a suppressed theme is a stable object like the registry's own.
const unlitThemes = new Map<ThemeId, Theme>();

function unlit(theme: Theme): Theme {
  let copy = unlitThemes.get(theme.id);
  if (!copy) {
    copy = { ...theme, glow: NO_GLOW };
    unlitThemes.set(theme.id, copy);
  }
  return copy;
}

type ThemeProviderProps = {
  // Resolved from storage by App.tsx before anything renders, so this is the
  // theme the first frame already shows.
  initialTheme: Theme;
  children: ReactNode;
};

export function ThemeProvider({ initialTheme, children }: ThemeProviderProps) {
  const [theme, setActiveTheme] = useState(initialTheme);
  const [glowSuppressed, setGlowSuppressed] = useState(false);

  // Blade Runner Req 44b: glow is suppressed wherever the platform exposes a
  // contrast preference. Only Android does (high text contrast). iOS has no
  // matching signal, so iOS keeps the single-stop glow of Req 44a. That is a
  // known, unresolved platform limitation, not a solved requirement.
  // The Platform check is not just for clarity: on iOS, RN 0.81's
  // isHighTextContrastEnabled returns a promise that never settles.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    AccessibilityInfo.isHighTextContrastEnabled().then(setGlowSuppressed);
    const sub = AccessibilityInfo.addEventListener("highTextContrastChanged", setGlowSuppressed);
    return () => sub.remove();
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setActiveTheme(getTheme(id));
    // Not awaited: the theme applies in this render whether or not the write
    // lands (Requirement 5.5).
    void writeStoredTheme(id);
  }, []);

  // Suppression is applied here, once: consumers receive a theme whose glow
  // tiers are all null, so every `t.glow.x ? … : {}` in a style factory already
  // renders no shadow, and no call site has to remember the preference.
  const value = useMemo(
    () => ({ theme: glowSuppressed ? unlit(theme) : theme, setTheme }),
    [theme, setTheme, glowSuppressed],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

/** The active theme. Read colours from here, never from a module-level token. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** Applies and persists a theme. */
export function useSetTheme(): (id: ThemeId) => void {
  return useContext(ThemeContext).setTheme;
}

type StyleFactory<T> = (theme: Theme) => T;

// Built once per (factory, theme) pair and then shared. Every DealRow in the
// list gets the same styles object instead of each row running
// StyleSheet.create, and switching back to a theme already seen costs nothing.
// Keyed on the theme object, not its id: a theme and its glow-suppressed copy
// share an id but need different styles. Both are stable objects.
const styleCache = new Map<StyleFactory<unknown>, Map<Theme, unknown>>();

/** Styles for the active theme, from a module-level `(theme) => StyleSheet.create(...)` factory. */
export function useThemedStyles<T>(factory: StyleFactory<T>): T {
  const theme = useTheme();

  let byTheme = styleCache.get(factory);
  if (!byTheme) {
    byTheme = new Map();
    styleCache.set(factory, byTheme);
  }

  // One lookup on the hit path. A StyleSheet.create result is never undefined,
  // so undefined can only mean "not built yet".
  let styles = byTheme.get(theme) as T | undefined;
  if (styles === undefined) {
    styles = factory(theme);
    byTheme.set(theme, styles);
  }
  return styles;
}

/** A translucent wash of a role colour. The hex stays the single literal. */
export function rgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    // Fail loudly: a wash built from a non-hex value would silently render as
    // an invalid colour.
    throw new Error(`rgba() needs a #RRGGBB value, got "${hex}"`);
  }
  const [r, g, b] = match.slice(1).map((pair) => parseInt(pair, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Platform-neutral font ids to the expo-font keys loaded by App.tsx's useFonts.
// Only faces that are actually loaded are listed, so asking for one that isn't
// throws instead of silently falling back to the system font.
const FONT_FAMILIES: Record<FontId, Partial<Record<FontWeight, string>>> = {
  pressStart2P: { 400: "PressStart2P_400Regular" },
  bebasNeue: { 400: "BebasNeue_400Regular" },
  ibmPlexMono: {
    400: "IBMPlexMono_400Regular",
    500: "IBMPlexMono_500Medium",
    700: "IBMPlexMono_700Bold",
  },
};

/** The expo-font key for a theme font id at a weight. */
export function fontFamily(id: FontId, weight: FontWeight): string {
  const family = FONT_FAMILIES[id][weight];
  if (!family) {
    throw new Error(`No loaded ${id} face at weight ${weight}`);
  }
  return family;
}

/**
 * The theme's wordmark type at an authored Retro Arcade size. The size scales
 * and the caller's lineHeight stays put, so the line box is identical in every
 * theme (Requirement 2.2).
 */
export function displayType(theme: Theme, authoredSize: number): TextStyle {
  const { family, weight, scale, tracking } = theme.type.display;
  return {
    fontFamily: fontFamily(family, weight),
    fontSize: authoredSize * scale,
    letterSpacing: tracking.mobile,
  };
}

/** The theme's label type for one of the four mobile label slots. Sizes stay per slot. */
export function labelType(theme: Theme, slot: MobileLabelSlot): TextStyle {
  const { family, weight, transform, tracking } = theme.type.label;
  return {
    fontFamily: fontFamily(family, weight),
    textTransform: transform,
    letterSpacing: tracking.mobile[slot],
  };
}

/** The authored size of the four label slots, in every theme (Invariant 3). */
export const LABEL_FONT_SIZE = 9;

// Blade Runner Req 44a: React Native has one text shadow and no em unit, so the
// web's em radii survive as multiples of the font size.
const SIGN_GLOW_RADIUS = 0.5;
const LABEL_GLOW_RADIUS = 0.6;

function textGlow(color: string, alpha: number, radius: number): TextStyle {
  return {
    textShadowColor: rgba(color, alpha),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: radius,
  };
}

// A null tier is an empty style, so no shadow prop exists at all
// (Requirement 2.4). That covers suppression too: see ThemeProvider.

/** Sign tier, mobile degradation: one stop at the inner alpha, outer dropped (Req 44a). */
export function signGlow(theme: Theme, color: string, fontSize: number): TextStyle {
  const { sign } = theme.glow;
  return sign ? textGlow(color, sign.inner, fontSize * SIGN_GLOW_RADIUS) : {};
}

/** Label tier: one stop, full parity with web (Req 44a). */
export function labelGlow(theme: Theme, color: string, fontSize: number): TextStyle {
  const { label } = theme.glow;
  return label ? textGlow(color, label.alpha, fontSize * LABEL_GLOW_RADIUS) : {};
}
