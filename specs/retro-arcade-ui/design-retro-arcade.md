# Spec: Retro Arcade Visual Direction

## Overview
DealSniper's mobile Watchlist screen and web kiosk market board currently use a stock-ticker/market-board visual language (IBM Plex Mono numerics, Bebas Neue brand type, green/amber/red discount tiers). This spec re-skins that visual language toward a retro arcade/game aesthetic (pixel fonts for chrome, CRT/scanline texture, chiptune-era palette accents, arcade-style status messaging) while leaving the existing UX flow — screens, navigation, refresh triggers, timers, hotkeys — completely unchanged.

## Goals
- Apply pixel-font treatment to brand/chrome/label text without degrading numeric legibility.
- Add a scoped CRT/scanline visual texture that never reduces contrast on price/discount/match data.
- Extend (not replace) the existing green/amber/red discount-tier palette with two new status colors (cyan, magenta).
- Add a new persistent arcade-style status-ticker line communicating refresh state (live fetch / cached / rate-limited / quota-exhausted) at the whole-refresh level.
- Apply a restrained "high score" frame treatment to the match% value.

## Non-Goals
- No changes to navigation structure, screen count, refresh triggers/timers (`BOARD_MS`, `LIVE_REFRESH_MS`), or hotkeys (R/F/P) in `web/src/App.tsx`.
- No changes to pull-to-refresh behavior in `mobile/src/screens/WatchlistScreen.tsx`.
- No digit-flip, jitter, or flicker animation anywhere.
- No new backend logic — this spec assumes/depends on but does not define the refresh-state data contract (owned by the implementation spec / `backend/app/services/refresh.py`).
- No re-skin of `CartPanel`/`cart-panel`/`cart-overlay` (web) or `CartScreen`/`DealDetailScreen`/`PreferencesScreen` (mobile) — scope is limited to the Watchlist/kiosk board screen only (see Requirement 12).
- No light-theme support — the app is single-theme dark (`web/src/index.css:7` hardcodes `color-scheme: dark`; no theme toggle exists in either codebase). Out of scope because it does not exist today.

## Requirements

### Typography
1. Numeric data — price (`.px`, `mobile DealRow.tsx` `styles.price`), discount (`.delta`, `styles.delta`), match score (`.match`, `styles.score`), rating (`.rating`) — continues to render in IBM Plex Mono (`fonts.mono`/`monoMed`/`monoBold` on mobile; `"IBM Plex Mono"` on web). No pixel font is applied to any element carrying a numeric value used for scanning/comparison.
2. A pixel font (`Press Start 2P` or `Silkscreen` — final selection left to implementation, both acceptable) replaces Bebas Neue in the brand slot: web `.brand` (`App.css:20-27`), mobile `styles.brand` (`WatchlistScreen.tsx:177-183`).
3. The same pixel font applies to column/section header labels only: web `.board-head span` items (`SYMBOL`, `NAME`, `RATING`, `LAST`, `Δ%`, `MATCH`, `CART` — `App.tsx:210-218`), web `.num-label` (`LAST`, `Δ%`, `RATING`, `MATCH` — `App.tsx:167,171,178,188`), mobile `styles.colSym`/`styles.colPx` (`WatchlistScreen.tsx:118-120`), and the `TickerTape` `LIVE TAPE` label (web `.tape-label`, mobile `styles.label`).
4. The new status-ticker line (Requirement 6) renders entirely in the pixel font, including its embedded values (seconds, dates) — no mono digits mixed into that line.
5. `fontsource`/`expo-google-fonts` packages for the selected pixel font must be added as a dependency in both `web/package.json` and `mobile/package.json` (mirroring how Bebas Neue/IBM Plex Mono are currently loaded via `@fontsource/bebas-neue` and `@expo-google-fonts/bebas-neue`).

### CRT / Scanline
6. Web: a single scanline overlay element is added at the app-shell level in `web/src/index.css` (or a new sibling element in `web/src/App.tsx` covering `.kiosk`), using `mix-blend-mode: overlay`, opacity in the 6–8% range, plus a subtle vignette. It is `position: fixed`, `inset: 0`, `pointer-events: none`, and stacks above the board content in z-index but below the cart overlay/panel (`.cart-overlay` is `z-index: 50`).
7. Mobile: the same visual effect is implemented as a fixed-position `View` with `pointer-events: "none"`, added once inside `WatchlistScreen.tsx`'s root `styles.screen` container (not inside `DealRow` or `TickerTape`), rendered above the `FlatList`/header content in z-order.
8. Numeric cells that could sit under the overlay — web `.px`, `.delta`, `.match`, `.rating` (`App.css:277-290`) and their mobile equivalents (`DealRow.tsx` `styles.price`, `styles.delta`, `styles.score`) — get an explicit solid background chip (using existing `colors.bg`/`colors.bgElevated`) so the overlay's blend mode cannot reduce their contrast.
9. The scanline/vignette is static (no animated flicker, jitter, or roll) in both web and mobile implementations.

### Palette
10. Add two color tokens to both palette sources — `mobile/src/theme.ts` (`colors` object) and `web/src/types.ts` (`colors` object), keeping the two files' values identical as they are today:
    - `cyan: "#4BD4D4"` — live fetch / fresh status text.
    - `magenta: "#C45BC4"` — cached / stale status text (dim variant of the existing amber-badge treatment).
11. No existing color token (`green`, `greenDim`, `red`, `amber`, retailer colors) changes value or meaning. The discount-tier logic (`pct_off >= 20 → green`, `pct_off > 0 → amber`, else `red`) is unchanged.

### Scope Boundary
12. This spec's visual changes (pixel font, CRT overlay, new palette tokens, status-ticker line, match% frame) apply only to: web `.kiosk` root and its board/hero/ticker-tape children in `App.tsx`; mobile `WatchlistScreen.tsx` and its `DealRow`/`TickerTape` children. `CartPanel.tsx` (web), `.cart-overlay`/`.cart-panel` (web CSS), and mobile's `CartScreen`, `DealDetailScreen`, `PreferencesScreen` are explicitly excluded from this pass and keep their current styling.

### Status-Ticker Line
13. A new, single-line, persistent UI element is added to both platforms, distinct from and in addition to the existing bottom status footer (web `.status` footer at `App.tsx:268-271`; mobile `styles.footerText` at `WatchlistScreen.tsx:149-158`). Neither existing footer changes text content, styling, or position — they continue to show their current plain-text content (symbol count, API base, or error message) exactly as today.
14. Placement: web — inserted between the hero-quote section and `.board-head` in `App.tsx` (after the hero block closes at line 208, before line 210). Mobile — inserted between `<TickerTape deals={deals} />` and the `boardHeader` View in `WatchlistScreen.tsx` (between lines 116 and 117).
15. Rendering: fixed-width, all-caps, no punctuation beyond the fixed `◆` separator glyph, one line only, in the pixel font (Requirement 4). Format per state:
    - Live fetch: `LIVE FEED ◆ SCANNING...` — color `cyan`, blinking/pulsing animation permitted (the only state permitted any animation on this line).
    - Cache hit: `CACHED DATA ◆ [XX]S AGO` — color `magenta`, static, `[XX]` sourced from the cache entry's age in seconds.
    - Rate-limited: `COOLDOWN ◆ RETRY [XX]S` — color `red`, static, `[XX]` sourced from the remaining cooldown in seconds.
    - Quota-exhausted: `OUT OF CREDITS ◆ RESUME [DATE]` — color `red`, static, `[DATE]` sourced from the quota reset date.
16. Data dependency (external to this spec): the frontend currently receives only a free-text `message` string from `refreshDeals()` (`web/src/App.tsx:73-74`, `mobile/src/screens/WatchlistScreen.tsx:65-66`) — there is no structured field today distinguishing which of the four states above is active, nor the numeric seconds/date values they require. This spec assumes the implementation spec will define a structured state field and the associated numeric/date payload; the exact API contract is out of scope here and owned by the Researcher's implementation spec.
17. `prefers-reduced-motion` handling: when the OS/browser reduced-motion preference is enabled, the `LIVE FEED` blink/pulse is suppressed and the line renders static (text and color unchanged) instead.
18. Viewport handling on web: at the existing `900px` breakpoint (`App.css:474`), where `.board-head`/`.row` already collapse to fewer columns, the status-ticker line keeps its full text and placement — it never truncates, abbreviates, or drops words (e.g. `RETRY [XX]S`, the resume date) at any viewport width, since those are the actionable part of the message. If a viewport is narrow enough that the full line cannot fit on one row, it wraps to a second line rather than cutting text; it never hides.
19. Precedence when multiple retailer adapters return different states within one refresh cycle: the line shows exactly one state using this fixed priority, highest first: `OUT OF CREDITS` (quota-exhausted) > `COOLDOWN` (rate-limited) > `LIVE FEED` (any adapter fetched live) > `CACHED DATA` (all adapters served from cache). This priority reflects severity of user-facing impact (a hard stop outranks a soft cooldown, and any live activity outranks an all-cache cycle).

### Match% Score Treatment
20. The `MATCH` column header/label uses the pixel font (per Requirement 3); the numeric match value itself stays in mono per Requirement 1, with no animation.
21. Mobile: match value font size increases from the current `styles.score` (12px, `fonts.mono`, `colors.textDim` — `DealRow.tsx:129-134`) to 15px using `fonts.monoBold`, matching the visual weight of the hero stat-grid values.
22. Web: match value (`.match`, sharing base rule with `.px`/`.delta`/`.rating` at `App.css:277-284`) gets a dedicated rule bumping its `font-weight` to `700` and `font-size` to match the emphasis level of `.num-value` (`App.css:143-148`) proportionally within the row context (not literally the hero's `clamp(1.8rem, 3vw, 2.6rem)`, which is sized for the single hero card, not a repeating row).
23. When `match_score >= 90`, both platforms add a thin pixel-style border/chip around the match value only (not the whole row) — same visual weight and treatment pattern as how `pct_off >= 20` currently gets the `green` color treatment on `.delta`/`styles.delta`, but expressed as a border/chip rather than a color change, since match% does not use the green/amber/red discount palette.

## Edge Cases
1. When `match_score` is `null` (mobile `DealRow.tsx:41-43` and web `App.tsx:189,252` both already guard this with `?? 0` / conditional render) — the border/chip treatment (Requirement 23) does not apply, matching existing null-handling; no new null state is introduced.
2. When the OS/browser has `prefers-reduced-motion` enabled, both the `LIVE FEED` blink (Requirement 17) and any future hover/flash animations already in the codebase (`.flash`/`pulse` keyframes, `App.css:465-472`) are unaffected by this spec — only the new status-ticker line's blink is scoped by this requirement; existing flash animations are out of scope for this pass.
3. When no deals are loaded yet (`deals.length === 0`, the `.empty`/`ListEmptyComponent` states), the status-ticker line still renders using whatever state the last refresh attempt produced — it is not tied to deal-row presence.
4. When multiple adapters are in different states in the same refresh cycle, Requirement 19's fixed priority order applies.
5. On web viewports narrower than 900px, or any viewport too narrow for the full status-ticker line to fit on one row, the line wraps to a second line rather than truncating, abbreviating, or hiding (Requirement 18).

## Acceptance Criteria
- [ ] Web `.brand` and mobile `styles.brand` render in the selected pixel font; both platforms' font dependency is added to their respective package manifests.
- [ ] All numeric price/discount/match/rating values remain in IBM Plex Mono on both platforms — no pixel font applied to any digit used for scanning.
- [ ] Column header labels (`SYMBOL`, `NAME`, `RATING`, `LAST`, `Δ%`, `MATCH`, `CART`, `LIVE TAPE`) render in the pixel font on both platforms.
- [ ] A static scanline/vignette overlay is visible above the board content on both platforms, does not animate, and does not visually reduce contrast on `.px`/`.delta`/`.match`/`.rating` cells (verified by solid backing chips behind those cells).
- [ ] `cyan` (`#4BD4D4`) and `magenta` (`#C45BC4`) tokens exist in both `mobile/src/theme.ts` and `web/src/types.ts`, with no changes to existing token values.
- [ ] A new status-ticker line renders in the specified placement on both platforms, distinct from and without altering the existing bottom status footer.
- [ ] The status-ticker line displays the correct text/color for each of the four defined states, with `LIVE FEED` as the only state that blinks, and that blink suppressed under `prefers-reduced-motion`.
- [ ] When multiple adapter states conflict within one refresh, the line shows the single highest-priority state per Requirement 19.
- [ ] Match% value renders larger/bolder than the current baseline on both platforms, and shows the border/chip treatment only when `match_score >= 90`.
- [ ] `CartPanel`, mobile `CartScreen`/`DealDetailScreen`/`PreferencesScreen` are visually unchanged by this pass.
- [ ] No existing timer (`BOARD_MS`, `LIVE_REFRESH_MS`), hotkey (R/F/P), or pull-to-refresh trigger changes behavior.

## Key Files
- `mobile/src/theme.ts` — add `cyan`/`magenta` color tokens.
- `web/src/types.ts` — add `cyan`/`magenta` color tokens (mirrors `theme.ts`).
- `web/src/App.css` — pixel-font rules for `.brand`, `.board-head`, `.num-label`, `.tape-label`; scanline overlay rule; `.match` size/weight bump and `>=90` chip rule; new status-ticker line styles.
- `web/src/index.css` — app-shell-level scanline overlay element/rule.
- `web/src/App.tsx` — insert status-ticker line element between hero block (line 208) and `.board-head` (line 210).
- `web/src/TickerTape.css` — pixel-font rule for `.tape-label`.
- `mobile/src/theme.ts` — pixel font family export addition (`fonts.pixel` or similar).
- `mobile/src/screens/WatchlistScreen.tsx` — pixel-font styles for `styles.brand`, `styles.colSym`/`styles.colPx`; scanline overlay `View`; insert status-ticker line between `TickerTape` (line 116) and `boardHeader` (line 117).
- `mobile/src/components/DealRow.tsx` — `styles.score` size/weight bump, `>=90` border/chip treatment, solid backing chip behind numeric cells.
- `mobile/src/components/TickerTape.tsx` — pixel-font rule for `styles.label`.
- `web/package.json` / `mobile/package.json` — add pixel font dependency (fontsource / expo-google-fonts package for chosen font).
