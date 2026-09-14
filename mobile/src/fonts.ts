// Mobile font keys for expo-font. Kept out of theme.ts because that file must
// stay a byte-for-byte twin of web/src/theme.ts, and these keys are
// React-Native-specific.
//
// There is no pixel key: chrome type comes from the theme's display and label
// roles (themeStyles displayType/labelType), so a surface reaching for a
// look-named font fails to compile (Blade Runner Req 30). Press Start 2P stays
// loaded in App.tsx because Retro Arcade uses it.
export const fonts = {
  brand: "BebasNeue_400Regular",
  mono: "IBMPlexMono_400Regular",
  monoMed: "IBMPlexMono_500Medium",
  monoBold: "IBMPlexMono_700Bold",
};
