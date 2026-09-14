import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_THEME_ID, THEME_STORAGE_KEY, findTheme, getTheme, type Theme, type ThemeId } from "./theme";

/**
 * The theme to paint first. App.tsx awaits this before rendering anything, so
 * no frame ever shows the wrong theme (Requirement 5.3).
 *
 * An unknown id or unreadable storage yields the default silently, and nothing
 * is written back: a stored theme that is only temporarily unregistered must
 * survive (Requirement 5.4).
 */
export async function readStoredTheme(): Promise<Theme> {
  try {
    return findTheme(await AsyncStorage.getItem(THEME_STORAGE_KEY)) ?? getTheme(DEFAULT_THEME_ID);
  } catch {
    return getTheme(DEFAULT_THEME_ID);
  }
}

/**
 * Persists a chosen theme. A failed write doesn't stop the theme applying for
 * this session; it is logged, never surfaced as UI (Requirement 5.5).
 */
export async function writeStoredTheme(id: ThemeId): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, id);
  } catch (error) {
    const detail = { key: THEME_STORAGE_KEY, id, error: error instanceof Error ? error.message : String(error) };
    console.warn("⚠️ THEME_PERSIST_FAILED:", detail);
  }
}
