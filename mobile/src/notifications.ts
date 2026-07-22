import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

/** Expo Go no longer supports remote push (Android SDK 53+). Skip quietly. */
export function pushAvailable(): boolean {
  if (Constants.appOwnership === "expo") {
    return false;
  }
  return true;
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!pushAvailable()) {
    return null;
  }

  // Lazy-load so Expo Go never touches the removed native module path at startup
  const Notifications = await import("expo-notifications");

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (!Device.isDevice && Platform.OS !== "ios") {
    // Simulators often can't get real push tokens
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("deals", {
      name: "Deal alerts",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

export async function addNotificationResponseListener(
  onDealId: (dealId: unknown) => void
): Promise<() => void> {
  if (!pushAvailable()) {
    return () => undefined;
  }
  const Notifications = await import("expo-notifications");
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    onDealId(response.notification.request.content.data?.dealId);
  });
  return () => sub.remove();
}
