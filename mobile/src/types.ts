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
  in_stock?: boolean | null;
  last_seen: string;
  rating?: number | null;
  review_count?: number | null;
  match_score?: number | null;
  is_demo?: boolean;
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
  upserted: number;
  amazon?: number;
  costco?: number;
  walmart?: number;
  homedepot?: number;
  alerts_sent: number;
  used_cache_only: boolean;
  skipped_external?: boolean;
  retry_after_seconds?: number;
  message: string;
  cache_hits?: string[];
  refresh_state?: RefreshState;
  cache_age_seconds?: number | null;
  cooldown_seconds?: number | null;
  quota_reset_date?: string | null;
};
