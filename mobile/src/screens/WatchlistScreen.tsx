import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
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

import { fetchDeals, getApiBase, msgOf, refreshDeals, RequestTimeoutError } from "../api";
import { loadCart, toggleCartItem } from "../cart";
import { DealRow } from "../components/DealRow";
import { HeaderMenu } from "../components/HeaderMenu";
import { TickerTape } from "../components/TickerTape";
import type { Deal, RefreshResult } from "../types";
import { fonts } from "../fonts";
import type { Theme, ThemeColors } from "../theme";
import { THEME_MARKS } from "../themeMarks";
import {
  LABEL_FONT_SIZE,
  displayType,
  labelGlow,
  labelType,
  signGlow,
  useTheme,
  useThemedStyles,
} from "../themeStyles";
import type { RootStackParamList } from "../navigation";

// Arcade status-ticker line (specs/retro-arcade-ui/design-retro-arcade.md,
// Requirements 13-19). refresh_state is additive/optional until the
// refresh-state-contract backend work lands — falls back to "cached" with a
// 0s age placeholder (Edge Case 2/4's own "null cache_age_seconds" case,
// which the backend spec explicitly leaves to this frontend implementation).
// The line's runtime portion comes back separately so it can render in a flat
// numeral <Text>: glow may never touch a digit (Blade Runner Req 36/46b).
// prefix + num + suffix is exactly the string this used to return.
type TickerLine = {
  prefix: string;
  num: string | null;
  suffix: string;
  color: string;
  live: boolean;
};

function tickerLineFor(colors: ThemeColors, result: RefreshResult | null): TickerLine {
  const state = result?.refresh_state;
  if (state === "quota_exhausted") {
    const date = (result?.quota_reset_date ?? "SOON").toUpperCase();
    return { prefix: "OUT OF CREDITS · RESUME ", num: date, suffix: "", color: colors.stateLoss, live: false };
  }
  if (state === "rate_limited") {
    const secs = result?.cooldown_seconds ?? 0;
    return { prefix: "COOLDOWN · RETRY ", num: String(secs), suffix: "S", color: colors.stateLoss, live: false };
  }
  if (state === "live") {
    return { prefix: "LIVE FEED · SCANNING...", num: null, suffix: "", color: colors.stateLive, live: true };
  }
  const secs = result?.cache_age_seconds ?? 0;
  return { prefix: "CACHED DATA · ", num: String(secs), suffix: "S AGO", color: colors.stateCached, live: false };
}

// Authored Retro Arcade sizes. Glow radii are multiples of them (Req 44a), so
// each lives in one place.
const BRAND_SIZE = 16;
const DISCLOSURE_SIZE = 10;

type Props = NativeStackScreenProps<RootStackParamList, "Watchlist"> & {
  deviceId: string;
};

export function WatchlistScreen({ navigation, deviceId }: Props) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [cartIds, setCartIds] = useState<Set<number>>(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  const [refreshInfo, setRefreshInfo] = useState<RefreshResult | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The header's height, which is where the menu panel hangs from.
  const [headerHeight, setHeaderHeight] = useState(0);
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  const ticker = tickerLineFor(colors, refreshInfo);
  // The one Sign-tier glow whose colour is runtime (the ticker's state colour),
  // so it can't live in the cached styles (Blade Runner Req 42).
  const tickerGlow = signGlow(theme, ticker.color, LABEL_FONT_SIZE);

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
      setStatus(msgOf(err, "Failed to load"));
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
    let outcome = "";
    try {
      const result = await refreshDeals(deviceId, true);
      setRefreshInfo(result);
      outcome = result.message;
    } catch (err) {
      // A client-side abort only proves we stopped waiting -- it does not
      // prove the backend got the request -- so the copy says "may", not
      // "is". Nothing cancels the backend when this client gives up, though:
      // POST /refresh keeps awaiting refresh_deals() and commits its rows.
      outcome =
        err instanceof RequestTimeoutError
          ? "No response in time — the refresh may still be finishing on the server. Pull down again in a moment."
          : `Refresh failed (${msgOf(err, "unknown error")}).`;
    } finally {
      // Reload on both paths so a failed refresh doesn't leave a stale board.
      await load();
      // After load(), never before: load() writes its own status line, so
      // setting the outcome earlier would have it immediately overwritten.
      setStatus(outcome);
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
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.brandLockup}>
          {/* Decorative: DEALSNIPER is the accessible name. Exported PNGs at
              exactly 32/64/96px rather than react-native-svg, which is a native
              module and would need a new EAS build to ship. Metro picks the
              @2x/@3x file for the device density. */}
          <Image
            source={THEME_MARKS[theme.markId]}
            style={styles.brandMark}
            accessible={false}
          />
          <Text style={styles.brand}>
            DEAL<Text style={styles.brandAccent}>SNIPER</Text>
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate("Cart")}
            style={styles.headerButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
          >
            <Ionicons name="cart-outline" size={27} color={colors.accentPrimary} />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            style={styles.headerButton}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Ionicons name="menu-outline" size={27} color={colors.accentPrimary} />
          </Pressable>
        </View>
      </View>
      <TickerTape deals={deals} />
      <HeaderMenu
        visible={menuOpen}
        top={headerHeight}
        onClose={() => setMenuOpen(false)}
        onFilters={() => navigation.navigate("Preferences")}
      />
      <Animated.Text
        style={[styles.tickerLine, { color: ticker.color, opacity: blink }, tickerGlow]}
      >
        {ticker.prefix}
        {ticker.num !== null ? <Text style={styles.flatNumeral}>{ticker.num}</Text> : null}
        {ticker.suffix}
      </Animated.Text>
      <View style={styles.boardHeader}>
        <Text style={styles.colSym}>SYMBOL</Text>
        <Text style={styles.colPx}>LAST / CHG</Text>
      </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accentPrimary} size="large" />
        </View>
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
              tintColor={colors.accentPrimary}
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
        {/* The status is runtime text with no static chrome words, so it takes
            no glow and all of it sits in the flat numeral child (Req 46a/46b). */}
        <Text style={styles.footerText} numberOfLines={2}>
          <Text style={styles.flatNumeral}>{status || " "}</Text>
        </Text>
        <Text style={styles.disclosureText}>Some links may earn us a commission</Text>
      </View>
    </View>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: t.colors.surfaceDeep,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    ...labelType(t, "tickerLine"),
    // Its own taller line box, already the same in every theme.
    lineHeight: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: t.colors.surfaceInset,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.lineHairline,
  },
  header: {
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    backgroundColor: t.colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.lineHairline,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  // 32pt = 16x2. Integer DPRs (2, 3) land on 64/96px, which are exact
  // multiples of the 16px grid. Fractional Android densities (e.g. 2.625
  // -> 84px) cannot be integer by any render method -- a known, accepted
  // limit (specs/logo/design-logo.md Edge Case 5).
  brandMark: {
    width: 32,
    height: 32,
  },
  // The line box stays 22 in every theme, so switching never moves the header
  // (theme-switcher Requirement 2.2).
  brand: {
    ...displayType(t, BRAND_SIZE),
    ...signGlow(t, t.colors.accentPrimary, BRAND_SIZE * t.type.display.scale),
    color: t.colors.textPrimary,
    lineHeight: 22,
  },
  // Two-tone wordmark: only SNIPER's colour changes. Nested inside the brand
  // <Text> so it inherits font, size and spacing and stays one accessible label.
  brandAccent: {
    color: t.colors.accentPrimary,
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
  boardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.lineHairline,
    backgroundColor: t.colors.surfaceRaised,
  },
  colSym: {
    ...labelType(t, "colSym"),
    ...labelGlow(t, t.colors.textLabel, LABEL_FONT_SIZE),
    color: t.colors.textLabel,
  },
  colPx: {
    ...labelType(t, "colPx"),
    ...labelGlow(t, t.colors.textLabel, LABEL_FONT_SIZE),
    color: t.colors.textLabel,
  },
  empty: {
    color: t.colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: 16,
    lineHeight: 22,
    padding: 24,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: t.colors.lineHairline,
    backgroundColor: t.colors.surfaceRaised,
  },
  footerText: {
    color: t.colors.textLabel,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 19,
  },
  disclosureText: {
    color: t.colors.textSecondary,
    fontFamily: fonts.mono,
    ...labelGlow(t, t.colors.textSecondary, DISCLOSURE_SIZE),
    fontSize: DISCLOSURE_SIZE,
    lineHeight: 14,
    paddingTop: 2,
  },
  // Blade Runner Req 46b: nested <Text> inherits the parent's text shadow, so
  // a numeral child must reset it explicitly or the glow lands on its digits.
  // The family is explicit too, because in Retro Arcade the parent is pixel type.
  flatNumeral: {
    fontFamily: fonts.mono,
    textShadowRadius: 0,
    textShadowColor: "transparent",
  },
});
