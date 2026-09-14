import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_700Bold,
} from "@expo-google-fonts/ibm-plex-mono";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { PressStart2P_400Regular } from "@expo-google-fonts/press-start-2p";

import { registerDevice } from "./src/api";
import { getOrCreateDeviceId } from "./src/device";
import { addNotificationResponseListener, registerForPushNotifications } from "./src/notifications";
import type { RootStackParamList } from "./src/navigation";
import { CartScreen } from "./src/screens/CartScreen";
import { DealDetailScreen } from "./src/screens/DealDetailScreen";
import { PreferencesScreen } from "./src/screens/PreferencesScreen";
import { WatchlistScreen } from "./src/screens/WatchlistScreen";
import { fonts } from "./src/fonts";
import type { Theme } from "./src/theme";
import { ThemeProvider, useTheme, useThemedStyles } from "./src/themeStyles";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <ThemeProvider>
      <AppRoot />
    </ThemeProvider>
  );
}

// Everything below reads the theme, so it has to render inside ThemeProvider.
function AppRoot() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Memoised on the theme's colours so NavigationContainer keeps receiving the
  // same object across renders, as it did when this was a module-level constant.
  const navTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: colors.surfaceDeep,
        card: colors.surfaceRaised,
        text: colors.textPrimary,
        border: colors.lineHairline,
        primary: colors.accentPrimary,
      },
    }),
    [colors],
  );
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [fontsLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_700Bold,
    BebasNeue_400Regular,
    PressStart2P_400Regular,
  });

  useEffect(() => {
    (async () => {
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
      const token = await registerForPushNotifications();
      try {
        await registerDevice(id, token);
      } catch {
        // Backend may be offline on first launch
      }
    })();
  }, []);

  useEffect(() => {
    let remove: (() => void) | undefined;
    addNotificationResponseListener((dealId) => {
      void dealId;
    }).then((cleanup) => {
      remove = cleanup;
    });
    return () => remove?.();
  }, []);

  if (!fontsLoaded || !deviceId) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          key="dealsniper-root"
          initialRouteName="Watchlist"
          screenOptions={{
            headerStyle: { backgroundColor: colors.surfaceRaised },
            headerTintColor: colors.accentPrimary,
            headerTitleStyle: {
              fontFamily: fonts.monoMed,
              fontSize: 18,
            },
            contentStyle: { backgroundColor: colors.surfaceDeep },
          }}
        >
          <Stack.Screen name="Watchlist" options={{ headerShown: false }}>
            {(props) => <WatchlistScreen {...props} deviceId={deviceId} />}
          </Stack.Screen>
          <Stack.Screen name="DealDetail" options={{ title: "QUOTE" }}>
            {(props) => <DealDetailScreen {...props} deviceId={deviceId} />}
          </Stack.Screen>
          <Stack.Screen name="Preferences" options={{ title: "FILTERS" }}>
            {(props) => <PreferencesScreen {...props} deviceId={deviceId} />}
          </Stack.Screen>
          <Stack.Screen name="Cart" component={CartScreen} options={{ title: "CART" }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const createStyles = (t: Theme) => StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: t.colors.surfaceDeep,
    alignItems: "center",
    justifyContent: "center",
  },
});
