import { useEffect, useState } from "react";
import { fetchPreferences, HttpError, msgOf, refreshDeals, savePreferences } from "./api";
import { DEAL_TYPES, PCT_PRESETS, type Preferences } from "./types";
import "./PreferencesPanel.css";

type Props = {
  deviceId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function PreferencesPanel({ deviceId, open, onClose, onSaved }: Props) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [keywordsText, setKeywordsText] = useState("");
  const [categoriesText, setCategoriesText] = useState("");
  const [minPct, setMinPct] = useState("15");
  const [maxPrice, setMaxPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    fetchPreferences(deviceId)
      .then((p) => {
        setPrefs(p);
        setKeywordsText(p.keywords.join(", "));
        setCategoriesText(p.categories.join(", "));
        setMinPct(String(p.min_pct_off ?? 15));
        setMaxPrice(p.max_price != null ? String(p.max_price) : "");
        setMessage("");
      })
      .catch((err) => {
        setPrefs({
          device_id: deviceId,
          keywords: [],
          categories: [],
          min_pct_off: 15,
          max_price: null,
          retailers: ["amazon", "costco"],
          country: "US",
          alerts_enabled: true,
        });
        setKeywordsText("");
        setCategoriesText("");
        setMinPct("15");
        setMaxPrice("");
        setMessage(msgOf(err, "Failed to load"));
      });
  }, [deviceId, open]);

  if (!open) return null;

  const keywordSet = new Set(
    keywordsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  const toggleKeyword = (word: string) => {
    const next = new Set(keywordSet);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    setKeywordsText(Array.from(next).join(", "));
  };

  const toggleRetailer = (name: string) => {
    if (!prefs) return;
    const has = prefs.retailers.includes(name);
    const retailers = has
      ? prefs.retailers.filter((r) => r !== name)
      : [...prefs.retailers, name];
    setPrefs({ ...prefs, retailers: retailers.length ? retailers : ["amazon"] });
  };

  const onSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setMessage("");

    try {
      try {
        await savePreferences(deviceId, {
          keywords: keywordsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          categories: categoriesText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          min_pct_off: Number(minPct) || 0,
          max_price: maxPrice.trim() ? Number(maxPrice) : null,
          retailers: prefs.retailers,
          country: prefs.country,
          alerts_enabled: prefs.alerts_enabled,
        });
      } catch (err) {
        // Nothing was saved and no refresh was attempted -- say exactly that,
        // and skip the refresh entirely.
        setMessage(`Could not save filters (${msgOf(err)}).`);
        return;
      }

      setMessage("Refreshing deals…");
      try {
        await refreshDeals(deviceId, true);
        onClose();
      } catch (err) {
        // The filters ARE saved, and nothing cancels the backend when the
        // proxy gives up -- POST /refresh keeps awaiting refresh_deals() and
        // commits its rows. So keep the panel open (the message has to be
        // readable) and let the finally below reload the board regardless.
        setMessage(
          err instanceof HttpError && err.status === 504
            ? "Filters saved. The refresh is taking longer than the connection allows, but it is still running on the server — the board will show new deals as they land."
            : `Filters saved, but the refresh failed (${msgOf(err)}). The board has been reloaded with stored deals.`
        );
      } finally {
        // Reload the board after any refresh attempt, exactly as cycleLive()
        // does in App.tsx -- on success for the fresh rows, on failure for
        // whatever the backend committed before the proxy gave up.
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  const minPctNum = Number(minPct);

  return (
    <div className="prefs-overlay" onClick={onClose} role="presentation">
      <aside
        className="prefs-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Deal filters"
      >
        <div className="prefs-head">
          <h2>FILTERS</h2>
          <button type="button" className="prefs-close" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <p className="prefs-hint">
          Choose deal types and minimum % off. Save refreshes Amazon/Costco searches.
        </p>

        {!prefs ? (
          <>
            <p className="prefs-hint">Loading…</p>
            {message ? <p className="prefs-msg">{message}</p> : null}
          </>
        ) : (
          <>
            <label className="prefs-label">DEAL TYPE</label>
            <div className="prefs-chips">
              {DEAL_TYPES.map((word) => (
                <button
                  key={word}
                  type="button"
                  className={`prefs-chip ${keywordSet.has(word) ? "on" : ""}`}
                  onClick={() => toggleKeyword(word)}
                >
                  {word.toUpperCase()}
                </button>
              ))}
            </div>

            <label className="prefs-label">CUSTOM KEYWORDS</label>
            <input
              className="prefs-input"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder="tv, laptop, olive oil"
            />

            <label className="prefs-label">MIN % OFF</label>
            <div className="prefs-chips">
              {PCT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`prefs-chip ${minPctNum === pct ? "on" : ""}`}
                  onClick={() => setMinPct(String(pct))}
                >
                  {pct}%+
                </button>
              ))}
            </div>
            <input
              className="prefs-input"
              value={minPct}
              onChange={(e) => setMinPct(e.target.value)}
              inputMode="decimal"
            />

            <label className="prefs-label">MAX PRICE</label>
            <input
              className="prefs-input"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="optional"
              inputMode="decimal"
            />

            <label className="prefs-label">CATEGORIES</label>
            <input
              className="prefs-input"
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              placeholder="electronics, home"
            />
            <p className="prefs-hint">
              Optional — narrows by the retailer's own product category,
              separate from Deal Type above. Leave blank unless you have a
              specific category in mind.
            </p>

            <label className="prefs-label">RETAILERS</label>
            <div className="prefs-chips">
              {(
                [
                  ["amazon", "AMAZON"],
                  ["costco", "COSTCO"],
                  ["walmart", "WALMART"],
                  ["homedepot", "HOME DEPOT"],
                  ["ebay", "EBAY"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`prefs-chip ${prefs.retailers.includes(id) ? "on" : ""}`}
                  onClick={() => toggleRetailer(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="prefs-label">COUNTRY</label>
            <div className="prefs-chips">
              {["US", "CA"].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`prefs-chip ${prefs.country === c ? "on" : ""}`}
                  onClick={() => setPrefs({ ...prefs, country: c })}
                >
                  {c}
                </button>
              ))}
            </div>

            <button type="button" className="prefs-save" onClick={onSave} disabled={saving}>
              {saving ? "SAVING…" : "SAVE & REFRESH"}
            </button>
            {message ? <p className="prefs-msg">{message}</p> : null}
          </>
        )}
      </aside>
    </div>
  );
}
