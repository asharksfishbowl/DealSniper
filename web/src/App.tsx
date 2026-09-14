import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  IoCartOutline,
  IoCheckmarkOutline,
  IoColorPaletteOutline,
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
import { THEMES, type ThemeColors, type ThemeId } from "./theme";
import { useSetTheme, useTheme } from "./themeContext";
import { fontStack } from "./themeCss";
import { THEME_MARKS } from "./themeMarks";
import type { Deal, RefreshResult } from "./types";
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

function deltaColor(colors: ThemeColors, pct: number) {
  if (pct >= 20) return colors.stateGain;
  if (pct > 0) return colors.stateMid;
  return colors.stateLoss;
}

function retailerColor(colors: ThemeColors, retailer: string) {
  return (colors as Record<string, string>)[retailer] ?? colors.textSecondary;
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
// The line's runtime portion comes back separately so App can render it in a
// flat .ticker-num span: glow may never touch a digit (Blade Runner Req 36/46).
// prefix + num + suffix is exactly the string this used to return.
type TickerLine = {
  prefix: string;
  num: string | null;
  suffix: string;
  color: string;
  state: string;
};

function tickerLineFor(colors: ThemeColors, result: RefreshResult | null): TickerLine {
  const state = result?.refresh_state;
  if (state === "quota_exhausted") {
    const date = (result?.quota_reset_date ?? "SOON").toUpperCase();
    return { prefix: "OUT OF CREDITS · RESUME ", num: date, suffix: "", color: colors.stateLoss, state: "quota" };
  }
  if (state === "rate_limited") {
    const secs = result?.cooldown_seconds ?? 0;
    return { prefix: "COOLDOWN · RETRY ", num: String(secs), suffix: "S", color: colors.stateLoss, state: "cooldown" };
  }
  if (state === "live") {
    return { prefix: "LIVE FEED · SCANNING...", num: null, suffix: "", color: colors.stateLive, state: "live" };
  }
  const secs = result?.cache_age_seconds ?? 0;
  return { prefix: "CACHED DATA · ", num: String(secs), suffix: "S AGO", color: colors.stateCached, state: "cached" };
}

// The dropdown shell both menus share: a full-screen overlay that closes on
// click, around a role="menu" panel that swallows its own clicks.
function MenuOverlay({ label, className, style, onClose, children }: {
  label: string;
  className?: string;
  style?: CSSProperties;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="topbar-menu-overlay" onClick={onClose} role="presentation">
      <div
        className={className ? `topbar-menu ${className}` : "topbar-menu"}
        role="menu"
        aria-label={label}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// One row per registered theme, in registry order. Each row previews its OWN
// theme -- mark, display font, accent -- so the list shows the themes rather
// than naming them (theme-switcher Requirement 3.3).
function ThemeRows({ activeId, onChoose }: { activeId: ThemeId; onChoose: (id: ThemeId) => void }) {
  return (
    <>
      {THEMES.map((option) => {
        const checked = option.id === activeId;
        const mark = THEME_MARKS[option.markId].header32;
        return (
          <button
            key={option.id}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            className="theme-row"
            style={{
              fontFamily: fontStack(option.type.display.family, "display"),
              // The theme's own scale and tracking, as its wordmark uses them,
              // so every row shows equal cap height (theme-switcher D6).
              // Without the scale, Press Start 2P previews far larger than
              // Bebas Neue at the same font-size.
              fontSize: `calc(0.7rem * ${option.type.display.scale})`,
              letterSpacing: option.type.display.tracking.web,
              color: checked ? option.colors.accentPrimary : option.colors.textPrimary,
            }}
            onClick={() => onChoose(option.id)}
          >
            <img src={mark.src} srcSet={mark.srcSet} alt="" aria-hidden="true" />
            {option.label}
            {/* Selection never relies on colour alone. */}
            {checked ? <IoCheckmarkOutline className="theme-row-check" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </>
  );
}

export default function App() {
  const theme = useTheme();
  const { colors } = theme;
  const setTheme = useSetTheme();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [status, setStatus] = useState("connecting…");
  const [now, setNow] = useState(() => new Date());
  const [flashId, setFlashId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Where the Theme dropdown sits, measured from the Theme button when it opens;
  // null while closed.
  const [themeMenuAt, setThemeMenuAt] = useState<{ top: number; right: number } | null>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
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
    const boardTimer = window.setInterval(load, BOARD_MS); // golden-rule-ignore: backend has no push channel, so a read-only kiosk must poll
    const liveTimer = window.setInterval(() => cycleLive(false), LIVE_REFRESH_MS); // golden-rule-ignore: scheduled live refresh; no server event exists to trigger it
    const clockTimer = window.setInterval(() => setNow(new Date()), CLOCK_MS); // golden-rule-ignore: wall clock display; the passing second is itself the event
    return () => {
      window.clearInterval(boardTimer);
      window.clearInterval(liveTimer);
      window.clearInterval(clockTimer);
    };
  }, [cycleLive, deviceId, load]);

  const closeThemeMenu = useCallback(() => {
    setThemeMenuAt(null);
    themeButtonRef.current?.focus();
  }, []);

  const toggleThemeMenu = () => {
    if (themeMenuAt) {
      closeThemeMenu();
      return;
    }
    const rect = themeButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Anchored under the button and right-aligned to it.
    setThemeMenuAt({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  };

  // The dropdown's position is measured once, when it opens. Any resize --
  // fullscreen, the button beside Theme, is the obvious one -- would strand it
  // away from its button, and crossing 480px hides the button so focus couldn't
  // return to it. Closing on resize, like Escape does, avoids both.
  useEffect(() => {
    if (!themeMenuAt) return;
    window.addEventListener("resize", closeThemeMenu);
    return () => window.removeEventListener("resize", closeThemeMenu);
  }, [themeMenuAt, closeThemeMenu]);

  // Selecting applies instantly and persists (via setTheme), closes the menu
  // and returns focus to the control that opened it. The active theme just
  // closes (Requirement 3.3).
  const chooseTheme = (id: ThemeId, close: () => void, opener: HTMLButtonElement | null) => {
    if (id !== theme.id) setTheme(id);
    close();
    opener?.focus();
  };

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
        if (themeMenuAt) closeThemeMenu();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycleLive, filtersOpen, themeMenuAt, closeThemeMenu]);

  const top = deals[0];
  const ticker = tickerLineFor(colors, refreshInfo);
  const mark = THEME_MARKS[theme.markId];

  return (
    <div className="kiosk">
      {theme.overlay.opacity > 0 ? <div className="crt-overlay" aria-hidden="true" /> : null}
      <header className="topbar">
        <div className="brand-lockup">
          {/* Decorative: the DEALSNIPER heading beside it is the accessible
              name, so the mark carries no alt text of its own. The active
              theme picks the image; the box stays 48px, or 32px at <=900px,
              in every theme. */}
          <picture>
            <source media="(max-width: 900px)" srcSet={mark.header32.srcSet ?? mark.header32.src} />
            <img
              className="brand-mark"
              src={mark.header48.src}
              srcSet={mark.header48.srcSet}
              alt=""
              aria-hidden="true"
            />
          </picture>
          <div>
            <h1 className="brand">
              DEAL<span className="brand-accent">SNIPER</span>
            </h1>
            <p className="mode">KIOSK · MARKET BOARD</p>
          </div>
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
              <button
                ref={themeButtonRef}
                type="button"
                className="ghost"
                aria-label="Theme"
                title="Theme"
                aria-haspopup="menu"
                aria-expanded={themeMenuAt !== null}
                onClick={toggleThemeMenu}
              >
                <IoColorPaletteOutline aria-hidden="true" />
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
              ref={menuButtonRef}
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
        <MenuOverlay label="Menu" onClose={() => setMenuOpen(false)}>
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
            <div className="topbar-menu-divider" role="separator" />
            <div className="topbar-menu-label">THEME</div>
            <ThemeRows
              activeId={theme.id}
              onChoose={(id) => chooseTheme(id, () => setMenuOpen(false), menuButtonRef.current)}
            />
        </MenuOverlay>
      )}

      {themeMenuAt && (
        <MenuOverlay
          label="Theme"
          className="theme-menu"
          style={{ top: themeMenuAt.top, right: themeMenuAt.right }}
          onClose={closeThemeMenu}
        >
          <div className="topbar-menu-label">THEME</div>
          <ThemeRows
            activeId={theme.id}
            onChoose={(id) => chooseTheme(id, () => setThemeMenuAt(null), themeButtonRef.current)}
          />
        </MenuOverlay>
      )}

      <TickerTape deals={deals} />

      {top ? (
        (() => {
          const href = dealHref(top);
          const heroClass = `hero-quote ${flashId === top.id ? "flash" : ""} ${href ? "hero-link" : ""}`;
          const heroBody = (
            <>
              <div className="hero-meta">
                <span style={{ color: retailerColor(colors, top.retailer) }}>{top.ticker}</span>
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
                  <div className="num-value" style={{ color: deltaColor(colors, top.pct_off) }}>
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
        {ticker.prefix}
        {ticker.num !== null ? <span className="ticker-num">{ticker.num}</span> : null}
        {ticker.suffix}
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
              <span className="sym" style={{ color: retailerColor(colors, deal.retailer) }}>
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
              <span className="delta" style={{ color: deltaColor(colors, deal.pct_off) }}>
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
        <span className="status-num">{status}</span>
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
