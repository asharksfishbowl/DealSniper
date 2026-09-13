import { useCallback, useMemo, useState, type ReactNode } from "react";
import { getTheme, type Theme, type ThemeId } from "./theme";
import { ThemeContext } from "./themeContext";
import { applyTheme } from "./themeCss";
import { writeStoredTheme } from "./themePersistence";

type Props = {
  // Resolved and applied by main.tsx before the first render, so this is the
  // theme the first frame already shows.
  initialTheme: Theme;
  children: ReactNode;
};

export function ThemeProvider({ initialTheme, children }: Props) {
  const [theme, setActiveTheme] = useState(initialTheme);

  const setTheme = useCallback((id: ThemeId) => {
    const next = getTheme(id);
    // Custom properties first, then state: CSS-driven colours and inline
    // TSX colours land in the same frame, with no transition (Requirement 4.1).
    applyTheme(next);
    setActiveTheme(next);
    // After applying, so a failed write can't stop the switch (Requirement 5.5).
    writeStoredTheme(id);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
