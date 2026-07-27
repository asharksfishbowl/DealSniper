import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { fetchDeals, getApiBase, refreshDeals } from "../api";
import { loadCart, toggleCartItem } from "../cart";
import { DealRow } from "../components/DealRow";
import { TickerTape } from "../components/TickerTape";
import type { Deal, RefreshResult } from "../types";
import { colors, fonts } from "../theme";
import type { RootStackParamList } from "../navigation";

// Arcade status-ticker line (specs/retro-arcade-ui/design-retro-arcade.md,
// Requirements 13-19). refresh_state is additive/optional until the
// refresh-state-contract backend work lands — falls back to "cached" with a
// 0s age placeholder (Edge Case 2/4's own "null cache_age_seconds" case,
// which the backend spec explicitly leaves to this frontend implementation).
function tickerLineFor(result: RefreshResult | null): {
  text: string;
  color: string;
  live: boolean;
} {
  const state = result?.refresh_state;
  if (state === "quota_exhausted") {
    const date = (result?.quota_reset_date ?? "SOON").toUpperCase();
    return { text: `OUT OF CREDITS ◆ RESUME ${date}`, color: colors.red, live: false };
  }
  if (state === "rate_limited") {
    const secs = result?.cooldown_seconds ?? 0;
    return { text: `COOLDOWN ◆ RETRY ${secs}S`, color: colors.red, live: false };
  }
  if (state === "live") {
    return { text: "LIVE FEED ◆ SCANNING...", color: colors.cyan, live: true };
  }
  const secs = result?.cache_age_seconds ?? 0;
  return { text: `CACHED DATA ◆ ${secs}S AGO`, color: colors.magenta, live: false };
}

type Props = NativeStackScreenProps<RootStackParamList, "Watchlist"> & {
  deviceId: string;
};

export function WatchlistScreen({ navigation, deviceId }: Props) {
  const insets = useSafeAreaInsets();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [cartIds, setCartIds] = useState<Set<number>>(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [refreshInfo, setRefreshInfo] = useState<RefreshResult | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  const ticker = tickerLineFor(refreshInfo);

  useEffect(() => {
    if (!ticker.live || reduceMotion) {
      blink.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.35,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [ticker.live, reduceMotion, blink]);

  const loadCartState = useCallback(async () => {
    const cart = await loadCart();
    setCartCount(cart.length);
    setCartIds(new Set(cart.map((item) => item.id)));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchDeals(deviceId);
      setDeals(data);
      setStatus(`${data.length} symbols · ${getApiBase()}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadCartState();
    }, [load, loadCartState])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshDeals(deviceId, true);
      setStatus(result.message);
      setRefreshInfo(result);
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const onToggleCart = async (deal: Deal) => {
    const next = await toggleCartItem(deal);
    setCartCount(next.length);
    setCartIds(new Set(next.map((item) => item.id)));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.crtOverlay} pointerEvents="none" />
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, 12) + 10, paddingBottom: 14 },
        ]}
      >
        <Text style={styles.brand}>DEALSNIPER</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate("Cart")}
            style={styles.headerButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            <Ionicons name="cart-outline" size={27} color={colors.green} />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate("Preferences")}
            style={styles.headerButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Filters"
          >
            <Ionicons name="options-outline" size={27} color={colors.green} />
          </Pressable>
        </View>
      </View>
      <TickerTape deals={deals} />
      <Animated.Text
        style={[styles.tickerLine, { color: ticker.color, opacity: blink }]}
      >
        {ticker.text}
      </Animated.Text>
      <View style={styles.boardHeader}>
        <Text style={styles.colSym}>SYMBOL</Text>
        <Text style={styles.colPx}>LAST / Δ</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.green} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={deals}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <DealRow
              deal={item}
              inCart={cartIds.has(item.id)}
              onPress={() => navigation.navigate("DealDetail", { dealId: item.id })}
              onToggleCart={() => onToggleCart(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.green}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No deals match your filters. Tweak FILTERS or pull to refresh when the API is available.
            </Text>
          }
        />
      )}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 10) + 10, paddingTop: 12 },
        ]}
      >
        <Text style={styles.footerText} numberOfLines={2}>
          {status || " "}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Static CRT scanline/vignette texture (Requirements 6-9,
  // specs/retro-arcade-ui/design-retro-arcade.md). No flicker/jitter/roll.
  crtOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  tickerLine: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    letterSpacing: 0.5,
    lineHeight: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.bgTape,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  header: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: {
    color: colors.text,
    fontFamily: fonts.pixel,
    fontSize: 16,
    letterSpacing: 1,
    lineHeight: 22,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingBottom: 2,
  },
  headerButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    position: "relative",
    width: 36,
  },
  cartBadge: {
    alignItems: "center",
    backgroundColor: colors.red,
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
    color: colors.text,
    fontFamily: fonts.monoBold,
    fontSize: 9,
  },
  boardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  colSym: {
    color: colors.textDim,
    fontFamily: fonts.pixel,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  colPx: {
    color: colors.textDim,
    fontFamily: fonts.pixel,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 16,
    lineHeight: 22,
    padding: 24,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  footerText: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 19,
  },
});
