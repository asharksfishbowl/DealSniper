import { useEffect, useState } from "react";
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

import { registerDevice } from "./src/api";
import { getOrCreateDeviceId } from "./src/device";
import { addNotificationResponseListener, registerForPushNotifications } from "./src/notifications";
import type { RootStackParamList } from "./src/navigation";
import { CartScreen } from "./src/screens/CartScreen";
import { DealDetailScreen } from "./src/screens/DealDetailScreen";
import { PreferencesScreen } from "./src/screens/PreferencesScreen";
import { WatchlistScreen } from "./src/screens/WatchlistScreen";
import { colors, fonts } from "./src/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.green,
  },
};

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [fontsLoaded] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_700Bold,
    BebasNeue_400Regular,
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
        <ActivityIndicator color={colors.green} />
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
            headerStyle: { backgroundColor: colors.bgElevated },
            headerTintColor: colors.green,
            headerTitleStyle: {
              fontFamily: fonts.monoMed,
              fontSize: 18,
            },
            contentStyle: { backgroundColor: colors.bg },
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

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
