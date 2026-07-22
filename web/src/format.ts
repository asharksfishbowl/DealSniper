/** Shared deal display helpers for web + mobile-style formatting. */

export function formatReviews(count?: number | null): string {
  if (count == null || count < 0) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

export function formatRating(rating?: number | null, reviewCount?: number | null): string {
  if (rating == null) return "—";
  const stars = rating.toFixed(1);
  const reviews = formatReviews(reviewCount);
  return reviews ? `${stars}★ · ${reviews}` : `${stars}★`;
}
