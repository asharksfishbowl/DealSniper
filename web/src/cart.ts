import type { Deal } from "./types";

const CART_KEY = "dealsniper_cart_v1";

export function loadCart(): Deal[] {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveCart(items: Deal[]): void {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
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

  const url = new URL("https://www.amazon.com/gp/aws/cart/add.html");
  url.searchParams.set("AssociateTag", tag);
  amazonItems.forEach((item, index) => {
    const position = index + 1;
    url.searchParams.set(`ASIN.${position}`, item.external_id);
    url.searchParams.set(`Quantity.${position}`, "1");
  });
  return url.toString();
}
