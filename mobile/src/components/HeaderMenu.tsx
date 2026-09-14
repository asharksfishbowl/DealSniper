import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { fonts } from "../fonts";
import { THEMES, type Theme, type ThemeId } from "../theme";
import { THEME_MARKS } from "../themeMarks";
import { LABEL_FONT_SIZE, displayType, labelType, useSetTheme, useTheme, useThemedStyles } from "../themeStyles";

type Props = {
  visible: boolean;
  // The header's bottom edge, so the panel hangs directly under it.
  top: number;
  onClose: () => void;
  onFilters: () => void;
};

// Theme rows preview at the web row's size (0.7rem), through the theme's own
// display scale, so every row shows equal cap height (theme-switcher D6).
const THEME_ROW_AUTHORED_SIZE = 11;

// The watchlist header's menu (theme-switcher Requirement 9), mirroring the
// web kiosk's .topbar-menu. A transparent core Modal: no new dependency.
export function HeaderMenu({ visible, top, onClose, onFilters }: Props) {
  const theme = useTheme();
  const setTheme = useSetTheme();
  const styles = useThemedStyles(createStyles);

  const chooseTheme = (id: ThemeId) => {
    setTheme(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      // The screen draws under the status bar, so the modal must too, or `top`
      // (measured in the screen) would land one status bar too low on Android.
      statusBarTranslucent
      // Android back closes without changing anything (Requirement 9.4).
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.panel, { top }]}>
        <Pressable
          onPress={() => {
            onClose();
            onFilters();
          }}
          style={[styles.row, styles.rowRule]}
          accessibilityRole="button"
          accessibilityLabel="Filters"
        >
          <Ionicons name="options-outline" size={20} color={theme.colors.accentPrimary} />
          <Text style={styles.filtersText}>FILTERS</Text>
        </Pressable>
        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>THEME</Text>
        {THEMES.map((option) => (
          <ThemeRow
            key={option.id}
            option={option}
            checked={option.id === theme.id}
            onPress={() => chooseTheme(option.id)}
          />
        ))}
      </View>
    </Modal>
  );
}

function ThemeRow({ option, checked, onPress }: {
  option: Theme;
  checked: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={option.label}
    >
      <Image source={THEME_MARKS[option.markId]} style={styles.rowMark} accessible={false} />
      {/* The row's own theme, not the active one, so the list previews each theme. */}
      <Text
        style={[
          displayType(option, THEME_ROW_AUTHORED_SIZE),
          { color: checked ? option.colors.accentPrimary : option.colors.textPrimary },
        ]}
      >
        {option.label}
      </Text>
      {/* Selection never relies on colour alone. */}
      {checked ? (
        <Ionicons name="checkmark-outline" size={20} color={colors.accentPrimary} style={styles.rowCheck} />
      ) : null}
    </Pressable>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: "absolute",
    right: 16,
    minWidth: 220,
    backgroundColor: t.colors.surfaceInset,
    borderWidth: 1,
    borderColor: t.colors.lineAccent,
    boxShadow: `0 8px 24px ${t.colors.shadowDepth}`,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  rowRule: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.lineHairline,
  },
  filtersText: {
    color: t.colors.accentPrimary,
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 1,
  },
  // Overlaps the rule under the row above, so the two read as one line.
  divider: {
    borderTopWidth: 1,
    borderTopColor: t.colors.lineHairline,
    marginTop: -1,
  },
  sectionLabel: {
    ...labelType(t, "colSym"),
    color: t.colors.textLabel,
    fontSize: LABEL_FONT_SIZE,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 6,
  },
  rowMark: {
    width: 32,
    height: 32,
  },
  rowCheck: {
    marginLeft: "auto",
  },
});
