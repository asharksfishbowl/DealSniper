import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Deal } from "./types";

const CART_KEY = "dealsniper_cart_v1";
export const ASSOCIATE_TAG_KEY = "dealsniper_amazon_associate_tag";

export async function loadCart(): Promise<Deal[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveCart(items: Deal[]): Promise<void> {
  await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
}

export async function toggleCartItem(deal: Deal): Promise<Deal[]> {
  const cart = await loadCart();
  const exists = cart.some((item) => item.id === deal.id);
  const next = exists ? cart.filter((item) => item.id !== deal.id) : [...cart, deal];
  await saveCart(next);
  return next;
}

export async function removeCartItem(id: number): Promise<Deal[]> {
  const next = (await loadCart()).filter((item) => item.id !== id);
  await saveCart(next);
  return next;
}

export async function clearCart(): Promise<void> {
  await saveCart([]);
}

export async function loadAssociateTag(): Promise<string> {
  return (await AsyncStorage.getItem(ASSOCIATE_TAG_KEY)) ?? "";
}

export async function saveAssociateTag(tag: string): Promise<void> {
  await AsyncStorage.setItem(ASSOCIATE_TAG_KEY, tag.trim());
}

export function buildAmazonCartUrl(items: Deal[], associateTag: string): string | null {
  const amazonItems = items.filter(
    (item) =>
      item.retailer === "amazon" &&
      !item.is_demo &&
      /^[A-Z0-9]{10}$/i.test(item.external_id),
  );
  const tag = associateTag.trim();
  if (!tag || !amazonItems.length) return null;

  const params = [`AssociateTag=${encodeURIComponent(tag)}`];
  amazonItems.forEach((item, index) => {
    const position = index + 1;
    params.push(`ASIN.${position}=${encodeURIComponent(item.external_id)}`);
    params.push(`Quantity.${position}=1`);
  });
  return `https://www.amazon.com/gp/aws/cart/add.html?${params.join("&")}`;
}

export function storeLabel(retailer: string): string {
  if (retailer === "homedepot") return "HOME DEPOT";
  return retailer.toUpperCase();
}
