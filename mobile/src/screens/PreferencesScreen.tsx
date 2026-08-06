import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import {
  fetchPreferences,
  getApiBase,
  refreshDeals,
  registerDevice,
  savePreferences,
} from "../api";
import { registerForPushNotifications, pushAvailable } from "../notifications";
import type { Preferences } from "../types";
import { colors, fonts } from "../theme";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Preferences"> & {
  deviceId: string;
};

const RETAILERS = [
  { id: "amazon", label: "AMAZON" },
  { id: "costco", label: "COSTCO" },
  { id: "walmart", label: "WALMART" },
  { id: "homedepot", label: "HOME DEPOT" },
] as const;
const DEAL_TYPES = [
  "tv",
  "laptop",
  "headphones",
  "tablet",
  "monitor",
  "phone",
  "groceries",
  "vitamins",
  "coffee",
  "vacuum",
  "mattress",
  "tools",
];
const PCT_PRESETS = [10, 15, 20, 25, 30, 40, 50];

function parseList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyPrefs(deviceId: string): Preferences {
  return {
    device_id: deviceId,
    keywords: [],
    categories: [],
    min_pct_off: 15,
    max_price: null,
    retailers: ["amazon", "costco"],
    country: "US",
    alerts_enabled: true,
  };
}

export function PreferencesScreen({ navigation, deviceId }: Props) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [keywordsText, setKeywordsText] = useState("");
  const [categoriesText, setCategoriesText] = useState("");
  const [minPct, setMinPct] = useState("15");
  const [maxPrice, setMaxPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const applyPrefs = (p: Preferences) => {
    setPrefs(p);
    setKeywordsText(p.keywords.join(", "));
    setCategoriesText(p.categories.join(", "));
    setMinPct(String(p.min_pct_off ?? 15));
    setMaxPrice(p.max_price != null ? String(p.max_price) : "");
  };

  const load = () => {
    setLoading(true);
    setMessage("");
    fetchPreferences(deviceId)
      .then((p) => {
        applyPrefs(p);
      })
      .catch((err) => {
        applyPrefs(emptyPrefs(deviceId));
        setMessage(
          `${err instanceof Error ? err.message : "Could not load filters"} · API ${getApiBase()}`
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [deviceId]);

  const keywordSet = new Set(parseList(keywordsText).map((k) => k.toLowerCase()));

  const toggleKeyword = (word: string) => {
    const next = new Set(keywordSet);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    setKeywordsText(Array.from(next).join(", "));
  };

  const toggleRetailer = (name: string) => {
    if (!prefs) return;
    const has = prefs.retailers.includes(name);
    const retailers = has
      ? prefs.retailers.filter((r) => r !== name)
      : [...prefs.retailers, name];
    setPrefs({ ...prefs, retailers: retailers.length ? retailers : ["amazon"] });
  };

  const onToggleAlerts = async (value: boolean) => {
    if (!prefs) return;
    setPrefs({ ...prefs, alerts_enabled: value });
    if (value) {
      if (!pushAvailable()) {
        setMessage("Alerts saved · push needs a dev build (Expo Go doesn’t support it)");
        return;
      }
      const token = await registerForPushNotifications();
      await registerDevice(deviceId, token);
      setMessage(token ? "Push token registered" : "Alerts on (no push token on this device)");
    }
  };

  const onSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        keywords: parseList(keywordsText),
        categories: parseList(categoriesText),
        min_pct_off: Number(minPct) || 0,
        max_price: maxPrice.trim() ? Number(maxPrice) : null,
        retailers: prefs.retailers,
        country: prefs.country,
        alerts_enabled: prefs.alerts_enabled,
      };
      const saved = await savePreferences(deviceId, payload);
      setPrefs(saved);
      setMessage("Saving… refreshing deals");
      await refreshDeals(deviceId, true);
      setMessage("Filters saved · feed refreshed");
      navigation.navigate("Watchlist");
    } catch (err) {
      setMessage(
        `${err instanceof Error ? err.message : "Save failed"} · API ${getApiBase()}`
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading && !prefs) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={colors.green} style={{ marginTop: 40 }} />
        <Text style={styles.message}>Loading filters…</Text>
        <Text style={styles.apiHint}>{getApiBase()}</Text>
      </View>
    );
  }

  if (!prefs) {
    return null;
  }

  const minPctNum = Number(minPct);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.heading}>FILTERS</Text>
        <Text style={styles.hint}>
          Pick deal types and a minimum % off. Refresh uses these as search keywords.
        </Text>

        <Text style={styles.label}>DEAL TYPE</Text>
        <View style={styles.chips}>
          {DEAL_TYPES.map((word) => {
            const on = keywordSet.has(word);
            return (
              <Pressable
                key={word}
                onPress={() => toggleKeyword(word)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {word.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>CUSTOM KEYWORDS</Text>
        <TextInput
          style={styles.input}
          value={keywordsText}
          onChangeText={setKeywordsText}
          placeholder="tv, laptop, olive oil"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>MIN % OFF</Text>
        <View style={styles.chips}>
          {PCT_PRESETS.map((pct) => {
            const on = minPctNum === pct;
            return (
              <Pressable
                key={pct}
                onPress={() => setMinPct(String(pct))}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{pct}%+</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          value={minPct}
          onChangeText={setMinPct}
          keyboardType="decimal-pad"
          placeholder="15"
          placeholderTextColor={colors.textDim}
        />

        <Text style={styles.label}>MAX PRICE (OPTIONAL)</Text>
        <TextInput
          style={styles.input}
          value={maxPrice}
          onChangeText={setMaxPrice}
          keyboardType="decimal-pad"
          placeholder="e.g. 500"
          placeholderTextColor={colors.textDim}
        />

        <Text style={styles.label}>CATEGORIES</Text>
        <TextInput
          style={styles.input}
          value={categoriesText}
          onChangeText={setCategoriesText}
          placeholder="electronics, home, kitchen"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          Optional — narrows by the retailer's own product category, separate
          from Deal Type above. Leave blank unless you have a specific
          category in mind.
        </Text>

        <Text style={styles.label}>RETAILERS</Text>
        <View style={styles.chips}>
          {RETAILERS.map(({ id, label }) => {
            const on = prefs.retailers.includes(id);
            return (
              <Pressable
                key={id}
                onPress={() => toggleRetailer(id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>COUNTRY</Text>
        <View style={styles.chips}>
          {["US", "CA"].map((c) => {
            const on = prefs.country === c;
            return (
              <Pressable
                key={c}
                onPress={() => setPrefs({ ...prefs, country: c })}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.alertRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.label}>ALERTS</Text>
            <Text style={styles.hint}>
              {pushAvailable()
                ? "Notify when a deal clears your match threshold"
                : "Saved for later — push needs a development build (not Expo Go)"}
            </Text>
          </View>
          <Switch
            value={prefs.alerts_enabled}
            onValueChange={onToggleAlerts}
            trackColor={{ false: colors.border, true: colors.greenDim }}
            thumbColor={prefs.alerts_enabled ? colors.green : colors.textMuted}
          />
        </View>

        <Pressable style={styles.save} onPress={onSave} disabled={saving}>
          <Text style={styles.saveText}>{saving ? "SAVING…" : "SAVE & REFRESH"}</Text>
        </Pressable>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {message.includes("API ") ? (
          <Pressable style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>RETRY LOAD</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.brand,
    fontSize: 40,
    letterSpacing: 2,
  },
  hint: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    marginTop: 4,
  },
  label: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 17,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  chips: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  chipOn: {
    borderColor: colors.green,
    backgroundColor: "#122016",
  },
  chipText: {
    color: colors.textMuted,
    fontFamily: fonts.monoMed,
    fontSize: 14,
    letterSpacing: 1,
  },
  chipTextOn: {
    color: colors.green,
  },
  alertRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  save: {
    marginTop: 28,
    backgroundColor: colors.green,
    paddingVertical: 17,
    alignItems: "center",
  },
  saveText: {
    color: colors.bg,
    fontFamily: fonts.monoBold,
    fontSize: 16,
    letterSpacing: 1.5,
  },
  message: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    textAlign: "center",
  },
  apiHint: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  retry: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: "center",
  },
  retryText: {
    color: colors.green,
    fontFamily: fonts.monoMed,
    letterSpacing: 1.2,
    fontSize: 14,
  },
});
