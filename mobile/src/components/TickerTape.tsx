import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import type { Deal } from "../types";
import { fonts } from "../fonts";
import type { Theme } from "../theme";
import { LABEL_FONT_SIZE, labelGlow, labelType, useThemedStyles } from "../themeStyles";

type Props = {
  deals: Deal[];
};

export function TickerTape({ deals }: Props) {
  const styles = useThemedStyles(createStyles);
  const offset = useRef(new Animated.Value(0)).current;
  const hot = deals.filter((d) => d.pct_off >= 15).slice(0, 12);
  const items = hot.length ? hot : deals.slice(0, 8);
  const line = items
    .map((d) => {
      const rating = d.rating != null ? `  ${d.rating.toFixed(1)}` : "";
      return `${d.ticker}  ${d.pct_off >= 0 ? "+" : ""}${d.pct_off.toFixed(1)}%  $${d.price.toFixed(2)}${rating}`;
    })
    .join("     ·     ");

  useEffect(() => {
    offset.setValue(0);
    const anim = Animated.loop(
      Animated.timing(offset, {
        toValue: 1,
        duration: Math.max(18000, line.length * 45),
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [line, offset]);

  const translateX = offset.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -600],
  });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>LIVE TAPE</Text>
      <View style={styles.tape}>
        <Animated.Text style={[styles.text, { transform: [{ translateX }] }]}>
          {line}     ·     {line}
        </Animated.Text>
      </View>
    </View>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  wrap: {
    backgroundColor: t.colors.surfaceInset,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.lineHairline,
    paddingTop: 8,
    paddingBottom: 10,
  },
  label: {
    ...labelType(t, "tapeLabel"),
    ...labelGlow(t, t.colors.textLabel, LABEL_FONT_SIZE),
    color: t.colors.textLabel,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  tape: {
    overflow: "hidden",
    height: 27,
  },
  text: {
    color: t.colors.accentPrimary,
    fontFamily: fonts.monoMed,
    fontSize: 16,
    lineHeight: 22,
    width: 2000,
  },
});
