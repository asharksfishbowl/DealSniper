import { createContext, useContext } from "react";
import { DEFAULT_THEME_ID, getTheme, type Theme, type ThemeId } from "./theme";

export type ThemeContextValue = {
  theme: Theme;
  setTheme: (id: ThemeId) => void;
};

export const ThemeContext = createContext<ThemeContextValue>({
  theme: getTheme(DEFAULT_THEME_ID),
  setTheme: () => {
    // Fail loudly: a switcher rendered outside ThemeProvider would otherwise
    // look like it works and silently change nothing.
    throw new Error("setTheme called outside ThemeProvider");
  },
});

/** The active theme. Read colours from here, never from a module-level token. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** Switches the active theme: repaints, persists, and re-renders consumers. */
export function useSetTheme(): (id: ThemeId) => void {
  return useContext(ThemeContext).setTheme;
}
