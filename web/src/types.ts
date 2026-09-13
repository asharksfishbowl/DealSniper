export type Deal = {
  id: number;
  retailer: string;
  external_id: string;
  title: string;
  ticker: string;
  category?: string | null;
  price: number;
  list_price?: number | null;
  pct_off: number;
  url?: string | null;
  image_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  match_score?: number | null;
  is_demo?: boolean;
  last_seen: string;
};

export type Preferences = {
  device_id: string;
  keywords: string[];
  categories: string[];
  min_pct_off: number;
  max_price: number | null;
  retailers: string[];
  country: string;
  alerts_enabled: boolean;
};

// refresh_state and its detail fields are additive keys added by the
// refresh-state-contract backend work (specs/retro-arcade-ui/api-minimization-benchmarking.md)
// — optional here since they're absent from older API responses.
export type RefreshState = "live" | "cached" | "rate_limited" | "quota_exhausted";

export type RefreshResult = {
  message: string;
  upserted: number;
  skipped_external?: boolean;
  retry_after_seconds?: number;
  refresh_state?: RefreshState;
  cache_age_seconds?: number | null;
  cooldown_seconds?: number | null;
  quota_reset_date?: string | null;
};

export const DEAL_TYPES = [
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

export const PCT_PRESETS = [10, 15, 20, 25, 30, 40, 50];
