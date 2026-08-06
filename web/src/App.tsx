import { useCallback, useEffect, useState } from "react";
import {
  IoCartOutline,
  IoExpandOutline,
  IoMenuOutline,
  IoOptionsOutline,
  IoRefreshOutline,
} from "react-icons/io5";
import { FaArrowUpRightFromSquare, FaStar } from "react-icons/fa6";
import { fetchDeals, getApiBase, refreshDeals, registerDevice } from "./api";
import { loadCart, saveCart } from "./cart";
import { CartPanel } from "./CartPanel";
import { getKioskDeviceId } from "./device";
import { formatRating, formatReviews } from "./format";
import { PreferencesPanel } from "./PreferencesPanel";
import { TickerTape } from "./TickerTape";
import type { Deal, RefreshResult } from "./types";
import { colors } from "./types";
import "./App.css";

const BOARD_MS = 90_000;
const LIVE_REFRESH_MS = 10 * 60_000;
const CLOCK_MS = 1000;

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function deltaColor(pct: number) {
  if (pct >= 20) return colors.green;
  if (pct > 0) return colors.amber;
  return colors.red;
}

function retailerColor(retailer: string) {
  return (colors as Record<string, string>)[retailer] ?? colors.textMuted;
}

function formatClock(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dealHref(deal: Deal): string | undefined {
  return deal.url || undefined;
}

// Arcade status-ticker line (specs/retro-arcade-ui/design-retro-arcade.md,
// Requirements 13-19). refresh_state is additive/optional until the
// refresh-state-contract backend work lands — falls back to "cached" with a
// 0s age placeholder (Edge Case 2/4's own "null cache_age_seconds" case,
// which the backend spec explicitly leaves to this frontend implementation).
function tickerLineFor(result: RefreshResult | null): {
  text: string;
  color: string;
  state: string;
} {
  const state = result?.refresh_state;
  if (state === "quota_exhausted") {
    const date = (result?.quota_reset_date ?? "SOON").toUpperCase();
    return { text: `OUT OF CREDITS · RESUME ${date}`, color: colors.red, state: "quota" };
  }
  if (state === "rate_limited") {
    const secs = result?.cooldown_seconds ?? 0;
    return { text: `COOLDOWN · RETRY ${secs}S`, color: colors.red, state: "cooldown" };
  }
  if (state === "live") {
    return { text: "LIVE FEED · SCANNING...", color: colors.cyan, state: "live" };
  }
  const secs = result?.cache_age_seconds ?? 0;
  return { text: `CACHED DATA · ${secs}S AGO`, color: colors.magenta, state: "cached" };
}

export default function App() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [status, setStatus] = useState("connecting…");
  const [now, setNow] = useState(() => new Date());
  const [flashId, setFlashId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cart, setCart] = useState<Deal[]>(loadCart);
  const [refreshInfo, setRefreshInfo] = useState<RefreshResult | null>(null);
  const deviceId = getKioskDeviceId();

  const updateCart = (next: Deal[]) => {
    setCart(next);
    saveCart(next);
  };

  const toggleCartItem = (deal: Deal) => {
    const exists = cart.some((item) => item.id === deal.id);
    updateCart(exists ? cart.filter((item) => item.id !== deal.id) : [...cart, deal]);
  };

  const load = useCallback(async () => {
    try {
      const data = await fetchDeals(deviceId);
      setDeals((prev) => {
        if (prev.length && data[0] && prev[0]?.id !== data[0].id) {
          setFlashId(data[0].id);
          // Cleared by onAnimationEnd on the flashing element(s) once the CSS
          // "pulse" animation actually finishes, instead of a fixed timer
          // guessing how long that takes.
        }
        return data;
      });
      setStatus(`${data.length} symbols · ${getApiBase()}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "load failed");
    }
  }, [deviceId]);

  const cycleLive = useCallback(async (force = false) => {
    try {
      const result = await refreshDeals(deviceId, force);
      setStatus(result.message);
      setRefreshInfo(result);
    } catch {
      // still reload cache
    }
    await load();
  }, [deviceId, load]);

  useEffect(() => {
    registerDevice(deviceId).catch(() => undefined);
    load();
    // Board reloads from DB often; live OpenWebNinja fetches are throttled server-side
    const boardTimer = window.setInterval(load, BOARD_MS);
    const liveTimer = window.setInterval(() => cycleLive(false), LIVE_REFRESH_MS);
    const clockTimer = window.setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => {
      window.clearInterval(boardTimer);
      window.clearInterval(liveTimer);
      window.clearInterval(clockTimer);
    };
  }, [cycleLive, deviceId, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f" && !filtersOpen) {
        toggleFullscreen();
      }
      if (e.key === "r" || e.key === "R") {
        cycleLive(true);
      }
      if (e.key === "p" || e.key === "P") {
        setFiltersOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setFiltersOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleLive, filtersOpen]);

  const top = deals[0];
  const ticker = tickerLineFor(refreshInfo);

  return (
    <div className="kiosk">
      <div className="crt-overlay" aria-hidden="true" />
      <header className="topbar">
        <div>
          <h1 className="brand">DEALSNIPER</h1>
          <p className="mode">KIOSK · MARKET BOARD</p>
        </div>
        <div className="topbar-right">
          <div className="clock">{formatClock(now)}</div>
          {/* Grouped so .topbar-right has exactly two children (clock,
              buttons) -- lets space-between push the clock flush left and
              this whole cluster flush right on its own line once .topbar
              wraps at phone widths, instead of the clock and buttons
              drifting together as one blob. */}
          <div className="topbar-buttons">
            <div className="topbar-actions">
              <button
                type="button"
                className="ghost"
                aria-label="Filters"
                title="Filters"
                onClick={() => setFiltersOpen(true)}
              >
                <IoOptionsOutline aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ghost"
                aria-label="Refresh"
                title="Refresh"
                onClick={() => cycleLive(true)}
              >
                <IoRefreshOutline aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ghost"
                aria-label="Fullscreen"
                title="Fullscreen"
                onClick={toggleFullscreen}
              >
                <IoExpandOutline aria-hidden="true" />
              </button>
            </div>
            {/* Cart stays outside the hamburger at every width -- it's the
                one action a phone-width kiosk user reaches for constantly,
                unlike Filters/Refresh/Fullscreen which are occasional. */}
            <button
              type="button"
              className="ghost cart-top"
              aria-label={`Cart, ${cart.length} item${cart.length === 1 ? "" : "s"}`}
              title="Cart"
              onClick={() => setCartOpen(true)}
            >
              <IoCartOutline aria-hidden="true" />
              <span>{cart.length}</span>
            </button>
            <button
              type="button"
              className="ghost topbar-menu-btn"
              aria-label="Menu"
              title="Menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <IoMenuOutline aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          className="topbar-menu-overlay"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        >
          <div
            className="topbar-menu"
            role="menu"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              aria-label="Filters"
              onClick={() => {
                setFiltersOpen(true);
                setMenuOpen(false);
              }}
            >
              <IoOptionsOutline aria-hidden="true" /> Filters
            </button>
            <button
              type="button"
              role="menuitem"
              aria-label="Refresh"
              onClick={() => {
                cycleLive(true);
                setMenuOpen(false);
              }}
            >
              <IoRefreshOutline aria-hidden="true" /> Refresh
            </button>
            <button
              type="button"
              role="menuitem"
              aria-label="Fullscreen"
              onClick={() => {
                toggleFullscreen();
                setMenuOpen(false);
              }}
            >
              <IoExpandOutline aria-hidden="true" /> Fullscreen
            </button>
          </div>
        </div>
      )}

      <TickerTape deals={deals} />

      {top ? (
        (() => {
          const href = dealHref(top);
          const heroClass = `hero-quote ${flashId === top.id ? "flash" : ""} ${href ? "hero-link" : ""}`;
          const heroBody = (
            <>
              <div className="hero-meta">
                <span style={{ color: retailerColor(top.retailer) }}>{top.ticker}</span>
                <span className="hero-retailer">{top.retailer.toUpperCase()}</span>
                {top.is_demo ? (
                  <span className="demo-banner">DEMO DATA · PRICES ARE NOT LIVE</span>
                ) : null}
                {href ? (
                  <span className="hero-open">
                    OPEN <FaArrowUpRightFromSquare aria-hidden="true" />
                  </span>
                ) : null}
              </div>
              <p className="hero-title">{top.title}</p>
              <div className="hero-numbers">
                <div>
                  <div className="num-label">LAST</div>
                  <div className="num-value">${top.price.toFixed(2)}</div>
                </div>
                <div>
                  <div className="num-label">CHG%</div>
                  <div className="num-value" style={{ color: deltaColor(top.pct_off) }}>
                    {top.pct_off > 0 ? "+" : ""}
                    {top.pct_off.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="num-label">RATING</div>
                  <div className="num-value num-rating">
                    {top.rating != null ? top.rating.toFixed(1) : "—"}
                    {top.rating != null ? (
                      <span className="star">
                        <FaStar aria-hidden="true" />
                      </span>
                    ) : null}
                  </div>
                  {top.review_count != null ? (
                    <div className="num-sub">{formatReviews(top.review_count)} reviews</div>
                  ) : null}
                </div>
                <div>
                  <div className="num-label">MATCH</div>
                  <div className="num-value">{Math.round(top.match_score ?? 0)}</div>
                </div>
              </div>
            </>
          );
          const clearFlash = () => setFlashId(null);
          return href ? (
            <a
              className={heroClass}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="Open product page"
              onAnimationEnd={clearFlash}
            >
              {heroBody}
            </a>
          ) : (
            <section className={heroClass} onAnimationEnd={clearFlash}>
              {heroBody}
            </section>
          );
        })()
      ) : null}

      <div className={`ticker-line state-${ticker.state}`} style={{ color: ticker.color }}>
        {ticker.text}
      </div>

      <div className="board-head">
        <span>SYMBOL</span>
        <span>NAME</span>
        <span>RATING</span>
        <span>LAST</span>
        <span>CHG%</span>
        <span>MATCH</span>
        <span>CART</span>
      </div>

      <div className="board">
        {deals.map((deal, index) => {
          const href = dealHref(deal);
          const rowClass = `row ${index % 2 ? "alt" : ""} ${
            flashId === deal.id ? "flash" : ""
          }`;
          const inCart = cart.some((item) => item.id === deal.id);
          return (
            <div
              key={deal.id}
              className={rowClass}
              onAnimationEnd={() => setFlashId(null)}
            >
              <span className="sym" style={{ color: retailerColor(deal.retailer) }}>
                {deal.ticker || deal.external_id}
                {deal.is_demo ? <small className="demo-badge">DEMO</small> : null}
              </span>
              {href ? (
                <a
                  className="name name-link"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open product page"
                >
                  {deal.title}
                </a>
              ) : (
                <span className="name">{deal.title}</span>
              )}
              <span className="rating">{formatRating(deal.rating, deal.review_count)}</span>
              <span className="px">${deal.price.toFixed(2)}</span>
              <span className="delta" style={{ color: deltaColor(deal.pct_off) }}>
                {deal.pct_off > 0 ? "+" : ""}
                {deal.pct_off.toFixed(1)}%
              </span>
              <span
                className={`match ${(deal.match_score ?? 0) >= 90 ? "high-score" : ""}`}
              >
                {Math.round(deal.match_score ?? 0)}
              </span>
              <button
                type="button"
                className={`cart-add ${inCart ? "added" : ""}`}
                onClick={() => toggleCartItem(deal)}
              >
                {inCart ? "ADDED" : "+ ADD"}
              </button>
            </div>
          );
        })}
        {!deals.length ? (
          <div className="empty">No matches — open FILTERS and set types / min % off.</div>
        ) : null}
      </div>

      <footer className="status">
        <span>{status}</span>
        <span>P filters · F fullscreen · R refresh</span>
        <span>Some links may earn us a commission</span>
      </footer>

      <PreferencesPanel
        deviceId={deviceId}
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onSaved={load}
      />
      <CartPanel
        items={cart}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onRemove={(id) => updateCart(cart.filter((item) => item.id !== id))}
        onClear={() => updateCart([])}
      />
    </div>
  );
}
