import type { ImageSourcePropType } from "react-native";

import type { MarkId } from "./theme";

// Header mark per logo, at mobile's 32pt header size. Metro picks the @2x/@3x
// file for the device density from the base require().
//
// Typed on MarkId, so registering a theme whose mark has no asset fails tsc.
export const THEME_MARKS: Record<MarkId, ImageSourcePropType> = {
  "pixel-reticle": require("../assets/reticle-mark.png"),
  "neon-reticle": require("../assets/blade-runner-mark-32.png"),
};
