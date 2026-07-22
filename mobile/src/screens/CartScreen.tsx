import { useCallback, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buildAmazonCartUrl,
  clearCart,
  loadAssociateTag,
  loadCart,
  removeCartItem,
  saveAssociateTag,
  storeLabel,
} from "../cart";
import type { Deal } from "../types";
import { colors, fonts } from "../theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Cart">;

export function CartScreen({}: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Deal[]>([]);
  const [associateTag, setAssociateTag] = useState("");

  const reload = useCallback(async () => {
    const [cart, tag] = await Promise.all([loadCart(), loadAssociateTag()]);
    setItems(cart);
    setAssociateTag(tag);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const groups = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    for (const item of items) {
      grouped.set(item.retailer, [...(grouped.get(item.retailer) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [items]);

  const amazonUrl = buildAmazonCartUrl(items, associateTag);
  const estimatedTotal = items.reduce((sum, item) => sum + item.price, 0);

  const onRemove = async (id: number) => {
    setItems(await removeCartItem(id));
  };

  const onClear = async () => {
    await clearCart();
    setItems([]);
  };

  const onTagChange = async (value: string) => {
    setAssociateTag(value);
    await saveAssociateTag(value);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, 16) + 16 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.heading}>CART</Text>
      <Text style={styles.sub}>
        {items.length} saved item{items.length === 1 ? "" : "s"} · grouped by store
      </Text>

      {!items.length ? (
        <Text style={styles.empty}>Add deals from the board to group them by store.</Text>
      ) : (
        <>
          {groups.map(([retailer, storeItems]) => (
            <View style={styles.store} key={retailer}>
              <View style={styles.storeHead}>
                <Text style={styles.storeName}>{storeLabel(retailer)}</Text>
                <Text style={styles.storeCount}>
                  {storeItems.length} ITEM{storeItems.length === 1 ? "" : "S"} · $
                  {storeItems.reduce((sum, item) => sum + item.price, 0).toFixed(2)}
                </Text>
              </View>

              {storeItems.map((item) => (
                <View style={styles.item} key={item.id}>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.itemMeta}>
                      ${item.price.toFixed(2)} · {item.pct_off.toFixed(1)}% off
                    </Text>
                    {item.url ? (
                      <Pressable onPress={() => Linking.openURL(item.url!)} hitSlop={8}>
                        <Text style={styles.openLink}>OPEN PRODUCT ↗</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable onPress={() => onRemove(item.id)} hitSlop={8}>
                    <Text style={styles.remove}>REMOVE</Text>
                  </Pressable>
                </View>
              ))}

              {retailer === "amazon" ? (
                <View style={styles.amazonBox}>
                  <Text style={styles.label}>AMAZON ASSOCIATES TAG</Text>
                  <TextInput
                    style={styles.input}
                    value={associateTag}
                    onChangeText={onTagChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="required by Amazon"
                    placeholderTextColor={colors.textDim}
                  />
                  {amazonUrl ? (
                    <Pressable
                      style={styles.amazonCta}
                      onPress={() => Linking.openURL(amazonUrl)}
                    >
                      <Text style={styles.amazonCtaText}>ADD ALL TO AMAZON CART ↗</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.note}>
                      Enter an Associates tag to enable Amazon’s official multi-item cart. Demo
                      items cannot be added.
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={styles.note}>
                  This store has no reliable public multi-add link. Open items individually.
                </Text>
              )}
            </View>
          ))}

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>ESTIMATED TOTAL</Text>
            <Text style={styles.totalPrice}>${estimatedTotal.toFixed(2)}</Text>
            <Text style={styles.totalNote}>Before tax, shipping, and retailer price changes</Text>
          </View>

          <Pressable style={styles.clearBtn} onPress={onClear}>
            <Text style={styles.clearText}>CLEAR CART</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.brand,
    fontSize: 48,
    letterSpacing: 2,
    lineHeight: 52,
  },
  sub: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 13,
    marginBottom: 18,
    marginTop: 4,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 24,
  },
  store: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 16,
  },
  storeHead: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  storeName: {
    color: colors.green,
    fontFamily: fonts.monoMed,
    fontSize: 14,
    letterSpacing: 1.5,
  },
  storeCount: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  item: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  itemBody: {
    flex: 1,
  },
  itemTitle: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 20,
  },
  itemMeta: {
    color: colors.amber,
    fontFamily: fonts.mono,
    fontSize: 12,
    marginTop: 4,
  },
  openLink: {
    color: colors.green,
    fontFamily: fonts.monoMed,
    fontSize: 12,
    letterSpacing: 0.8,
    marginTop: 8,
  },
  remove: {
    color: colors.red,
    fontFamily: fonts.monoMed,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  amazonBox: {
    padding: 12,
  },
  label: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  amazonCta: {
    backgroundColor: "rgba(232, 163, 23, 0.12)",
    borderColor: colors.amazon,
    borderWidth: 1,
    paddingVertical: 12,
  },
  amazonCtaText: {
    color: colors.amazon,
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: "center",
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  totalBox: {
    alignItems: "flex-end",
    borderColor: colors.green,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  totalLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  totalPrice: {
    color: colors.green,
    fontFamily: fonts.monoBold,
    fontSize: 28,
    marginTop: 4,
  },
  totalNote: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 5,
  },
  clearBtn: {
    borderColor: "#4B2828",
    borderWidth: 1,
    marginTop: 4,
    paddingVertical: 14,
  },
  clearText: {
    color: colors.red,
    fontFamily: fonts.monoMed,
    fontSize: 13,
    letterSpacing: 1.2,
    textAlign: "center",
  },
});
