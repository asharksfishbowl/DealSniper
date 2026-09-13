import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatRating } from "../format";
import type { Deal } from "../types";
import { fonts } from "../fonts";
import type { Theme } from "../theme";
import { useTheme, useThemedStyles } from "../themeStyles";

type Props = {
  deal: Deal;
  inCart?: boolean;
  onPress: () => void;
  onToggleCart?: () => void;
};

export function DealRow({ deal, inCart = false, onPress, onToggleCart }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const strong = deal.pct_off >= 20;
  const deltaColor = strong ? colors.stateGain : deal.pct_off > 0 ? colors.stateMid : colors.stateLoss;
  const retailerColor =
    (colors as Record<string, string>)[deal.retailer] ?? colors.textSecondary;
  const ratingLabel = formatRating(deal.rating, deal.review_count);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.left}>
        <View style={styles.symbolLine}>
          <Text style={[styles.ticker, { color: retailerColor }]} numberOfLines={1}>
            {deal.ticker || deal.external_id}
          </Text>
          {deal.is_demo ? <Text style={styles.demoBadge}>DEMO DATA</Text> : null}
        </View>
        <Text style={styles.title} numberOfLines={3}>
          {deal.title}
        </Text>
        {deal.rating != null ? <Text style={styles.rating}>{ratingLabel}</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>${deal.price.toFixed(2)}</Text>
        <Text style={[styles.delta, { color: deltaColor }]}>
          {deal.pct_off > 0 ? "+" : ""}
          {deal.pct_off.toFixed(1)}%
        </Text>
        {deal.match_score != null ? (
          <Text
            style={[styles.score, deal.match_score >= 90 && styles.scoreHighChip]}
          >
            M {Math.round(deal.match_score)}
          </Text>
        ) : null}
        {onToggleCart ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation?.();
              onToggleCart();
            }}
            style={[styles.cartBtn, inCart && styles.cartBtnOn]}
            hitSlop={8}
          >
            <Text style={[styles.cartBtnText, inCart && styles.cartBtnTextOn]}>
              {inCart ? "ADDED" : "+ ADD"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.lineHairline,
    backgroundColor: t.colors.surfaceDeep,
  },
  pressed: {
    backgroundColor: t.colors.surfaceRaised,
  },
  left: {
    flex: 1,
    paddingRight: 12,
  },
  symbolLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  ticker: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  demoBadge: {
    backgroundColor: t.colors.stateDemo,
    borderRadius: 3,
    color: t.colors.stateDemoInk,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.8,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  title: {
    color: t.colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 20,
  },
  rating: {
    color: t.colors.accentSecondary,
    fontFamily: fonts.mono,
    fontSize: 13,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  right: {
    alignItems: "flex-end",
    minWidth: 98,
  },
  // Solid backing chip on price/delta/score so the CRT overlay (WatchlistScreen)
  // can never reduce their contrast (Requirement 8).
  price: {
    color: t.colors.textPrimary,
    fontFamily: fonts.monoMed,
    fontSize: 17,
    backgroundColor: t.colors.numChipBg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  delta: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    marginTop: 2,
    backgroundColor: t.colors.numChipBg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  score: {
    color: t.colors.textLabel,
    fontFamily: fonts.monoBold,
    fontSize: 15,
    marginTop: 2,
    letterSpacing: 1,
    backgroundColor: t.colors.numChipBg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  scoreHighChip: {
    borderWidth: 1,
    borderColor: t.colors.stateStandout,
  },
  cartBtn: {
    borderColor: t.colors.accentPrimary,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  cartBtnOn: {
    backgroundColor: t.colors.accentPrimary,
  },
  cartBtnText: {
    color: t.colors.accentPrimary,
    fontFamily: fonts.monoMed,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  cartBtnTextOn: {
    color: t.colors.accentPrimaryInk,
  },
});
