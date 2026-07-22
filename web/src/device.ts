const KEY = "dealsniper_kiosk_device_id";

export function getKioskDeviceId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id = `kiosk_${crypto.randomUUID().slice(0, 8)}`;
  localStorage.setItem(KEY, id);
  return id;
}
