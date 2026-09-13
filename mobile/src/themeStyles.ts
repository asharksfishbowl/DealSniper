import { createContext, createElement, useContext, type ReactNode } from "react";

import {
  DEFAULT_THEME_ID,
  getTheme,
  type FontId,
  type FontWeight,
  type Theme,
  type ThemeId,
} from "./theme";

// Fixed to the default theme in this phase: there is no switcher yet, so the
// provider never supplies anything else. Phase 4 moves the value into state
// that setTheme updates.
const DEFAULT_THEME = getTheme(DEFAULT_THEME_ID);

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return createElement(ThemeContext.Provider, { value: DEFAULT_THEME }, children);
}

/** The active theme. Read colours from here, never from a module-level token. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

type StyleFactory<T> = (theme: Theme) => T;

// Built once per (factory, theme) pair and then shared. Every DealRow in the
// list gets the same styles object instead of each row running
// StyleSheet.create, and switching back to a theme already seen costs nothing.
const styleCache = new Map<StyleFactory<unknown>, Map<ThemeId, unknown>>();

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
  let styles = byTheme.get(theme.id) as T | undefined;
  if (styles === undefined) {
    styles = factory(theme);
    byTheme.set(theme.id, styles);
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
