import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatRating } from "../format";
import type { Deal } from "../types";
import { colors, fonts } from "../theme";

type Props = {
  deal: Deal;
  inCart?: boolean;
  onPress: () => void;
  onToggleCart?: () => void;
};

export function DealRow({ deal, inCart = false, onPress, onToggleCart }: Props) {
  const strong = deal.pct_off >= 20;
  const deltaColor = strong ? colors.green : deal.pct_off > 0 ? colors.amber : colors.red;
  const retailerColor =
    (colors as Record<string, string>)[deal.retailer] ?? colors.textMuted;
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
          <Text style={styles.score}>M {Math.round(deal.match_score)}</Text>
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  pressed: {
    backgroundColor: colors.bgElevated,
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
    backgroundColor: colors.amber,
    borderRadius: 3,
    color: colors.bg,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.8,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  title: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 20,
  },
  rating: {
    color: colors.amber,
    fontFamily: fonts.mono,
    fontSize: 13,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  right: {
    alignItems: "flex-end",
    minWidth: 98,
  },
  price: {
    color: colors.text,
    fontFamily: fonts.monoMed,
    fontSize: 17,
  },
  delta: {
    fontFamily: fonts.monoBold,
    fontSize: 16,
    marginTop: 2,
  },
  score: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 1,
  },
  cartBtn: {
    borderColor: colors.green,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  cartBtnOn: {
    backgroundColor: colors.green,
  },
  cartBtnText: {
    color: colors.green,
    fontFamily: fonts.monoMed,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  cartBtnTextOn: {
    color: colors.bg,
  },
});
