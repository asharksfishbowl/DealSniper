import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { fetchDeal } from "../api";
import { loadCart, toggleCartItem } from "../cart";
import { formatRating, formatReviews } from "../format";
import type { Deal } from "../types";
import { fonts } from "../fonts";
import type { Theme } from "../theme";
import { useTheme, useThemedStyles } from "../themeStyles";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "DealDetail"> & {
  deviceId: string;
};

export function DealDetailScreen({ route, navigation, deviceId }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { dealId } = route.params;
  const [deal, setDeal] = useState<Deal | null>(null);
  const [inCart, setInCart] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDeal(dealId, deviceId)
      .then(setDeal)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [dealId, deviceId]);

  useFocusEffect(
    useCallback(() => {
      void loadCart().then((cart) => {
        setInCart(cart.some((item) => item.id === dealId));
        setCartCount(cart.length);
      });
    }, [dealId]),
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          style={styles.headerCart}
          onPress={() => navigation.navigate("Cart")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
        >
          <Ionicons name="cart-outline" size={26} color={colors.accentPrimary} />
          {cartCount > 0 ? (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ),
    });
  }, [cartCount, navigation]);

  if (error) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const deltaColor = deal.pct_off >= 20 ? colors.stateGain : colors.stateMid;

  const onToggleCart = async () => {
    const next = await toggleCartItem(deal);
    setInCart(next.some((item) => item.id === deal.id));
    setCartCount(next.length);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {deal.is_demo ? (
        <Text style={styles.demoBanner}>DEMO DATA · PRICES ARE NOT LIVE</Text>
      ) : null}
      <Text style={styles.ticker}>{deal.ticker}</Text>
      <Text style={styles.retailer}>{deal.retailer.toUpperCase()}</Text>
      <Text style={styles.title}>{deal.title}</Text>
      {deal.image_url ? (
        <Image source={{ uri: deal.image_url }} style={styles.image} resizeMode="contain" />
      ) : (
        <View style={styles.spark}>
          <View style={[styles.bar, { height: 20 }]} />
          <View style={[styles.bar, { height: 36 }]} />
          <View style={[styles.bar, { height: 28 }]} />
          <View style={[styles.bar, { height: 48, backgroundColor: colors.accentPrimary }]} />
          <View style={[styles.bar, { height: 40, backgroundColor: colors.accentPrimary }]} />
          <View style={[styles.bar, { height: 56, backgroundColor: colors.accentPrimary }]} />
        </View>
      )}
      <View style={styles.quote}>
        <View>
          <Text style={styles.quoteLabel}>LAST</Text>
          <Text style={styles.quotePrice}>${deal.price.toFixed(2)}</Text>
        </View>
        <View>
          <Text style={styles.quoteLabel}>Δ%</Text>
          <Text style={[styles.quoteDelta, { color: deltaColor }]}>
            {deal.pct_off > 0 ? "+" : ""}
            {deal.pct_off.toFixed(1)}%
          </Text>
        </View>
        <View>
          <Text style={styles.quoteLabel}>RATING</Text>
          <Text style={styles.quoteRating}>
            {deal.rating != null ? `${deal.rating.toFixed(1)}★` : "—"}
          </Text>
        </View>
        <View>
          <Text style={styles.quoteLabel}>MATCH</Text>
          <Text style={styles.quoteMatch}>{Math.round(deal.match_score ?? 0)}</Text>
        </View>
      </View>
      {deal.review_count != null ? (
        <Text style={styles.meta}>
          {formatReviews(deal.review_count)} reviews
          {deal.rating != null ? ` · ${formatRating(deal.rating, null)}` : ""}
        </Text>
      ) : null}
      {deal.list_price ? (
        <Text style={styles.listPrice}>List ${deal.list_price.toFixed(2)}</Text>
      ) : null}
      {deal.category ? <Text style={styles.meta}>Sector · {deal.category}</Text> : null}
      <Pressable
        style={[styles.cta, inCart ? styles.ctaSecondary : null]}
        onPress={onToggleCart}
      >
        <Text style={[styles.ctaText, inCart ? styles.ctaTextSecondary : null]}>
          {inCart ? "REMOVE FROM CART" : "ADD TO CART"}
        </Text>
      </Pressable>
      {deal.url ? (
        <Pressable style={styles.ctaOutline} onPress={() => Linking.openURL(deal.url!)}>
          <Text style={styles.ctaOutlineText}>OPEN {deal.retailer.toUpperCase()}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  headerCart: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    position: "relative",
    width: 36,
  },
  cartBadge: {
    alignItems: "center",
    backgroundColor: t.colors.stateLoss,
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 4,
    position: "absolute",
    right: -3,
    top: -3,
  },
  cartBadgeText: {
    color: t.colors.textPrimary,
    fontFamily: fonts.monoBold,
    fontSize: 9,
  },
  screen: {
    flex: 1,
    backgroundColor: t.colors.surfaceDeep,
  },
  content: {
    padding: 16,
  },
  demoBanner: {
    backgroundColor: t.colors.stateDemo,
    color: t.colors.stateDemoInk,
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "center",
  },
  ticker: {
    color: t.colors.accentPrimary,
    fontFamily: fonts.monoBold,
    fontSize: 22,
    letterSpacing: 1,
  },
  retailer: {
    color: t.colors.textLabel,
    fontFamily: fonts.mono,
    fontSize: 14,
    letterSpacing: 2,
    marginTop: 4,
  },
  title: {
    color: t.colors.textPrimary,
    fontFamily: fonts.monoMed,
    fontSize: 20,
    marginTop: 12,
    lineHeight: 28,
  },
  image: {
    width: "100%",
    height: 180,
    marginTop: 20,
    backgroundColor: t.colors.surfaceRaised,
  },
  spark: {
    height: 80,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 8,
  },
  bar: {
    flex: 1,
    backgroundColor: t.colors.lineHairline,
    borderRadius: 2,
  },
  quote: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: t.colors.lineHairline,
    gap: 8,
  },
  quoteLabel: {
    color: t.colors.textLabel,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  quotePrice: {
    color: t.colors.textPrimary,
    fontFamily: fonts.monoBold,
    fontSize: 24,
  },
  quoteDelta: {
    fontFamily: fonts.monoBold,
    fontSize: 24,
  },
  quoteRating: {
    color: t.colors.accentSecondary,
    fontFamily: fonts.monoBold,
    fontSize: 24,
  },
  quoteMatch: {
    color: t.colors.textPrimary,
    fontFamily: fonts.monoBold,
    fontSize: 24,
  },
  listPrice: {
    color: t.colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: 16,
    marginTop: 14,
    textDecorationLine: "line-through",
  },
  meta: {
    color: t.colors.textLabel,
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  cta: {
    marginTop: 28,
    backgroundColor: t.colors.accentPrimary,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaSecondary: {
    backgroundColor: "transparent",
    borderColor: t.colors.accentPrimary,
    borderWidth: 1,
  },
  ctaText: {
    color: t.colors.accentPrimaryInk,
    fontFamily: fonts.monoBold,
    fontSize: 17,
    letterSpacing: 1.5,
  },
  ctaTextSecondary: {
    color: t.colors.accentPrimary,
  },
  ctaOutline: {
    marginTop: 12,
    borderColor: t.colors.lineHairline,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaOutlineText: {
    color: t.colors.accentPrimary,
    fontFamily: fonts.monoBold,
    fontSize: 17,
    letterSpacing: 1.5,
  },
  error: {
    color: t.colors.stateLoss,
    fontFamily: fonts.mono,
    fontSize: 16,
    padding: 24,
  },
});
