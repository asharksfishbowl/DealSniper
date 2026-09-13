import { createContext, useContext } from "react";
import { DEFAULT_THEME_ID, getTheme, type Theme } from "./theme";

// Fixed to the default theme in this phase: there is no switcher yet, so nothing
// ever provides a different value. Phase 3 replaces the provided value with
// state that setTheme updates.
export const ThemeContext = createContext<Theme>(getTheme(DEFAULT_THEME_ID));

/** The active theme. Read colours from here, never from a module-level token. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
