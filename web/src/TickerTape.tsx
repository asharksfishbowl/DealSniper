import { useEffect, useRef } from "react";
import type { Deal } from "./types";
import "./TickerTape.css";

type Props = {
  deals: Deal[];
};

export function TickerTape({ deals }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hot = deals.filter((d) => d.pct_off >= 15).slice(0, 16);
  const items = hot.length ? hot : deals.slice(0, 12);
  const line = items
    .map((d) => {
      const rating = d.rating != null ? `  ${d.rating.toFixed(1)}` : "";
      return `${d.ticker}  ${d.pct_off >= 0 ? "+" : ""}${d.pct_off.toFixed(1)}%  $${d.price.toFixed(2)}${rating}`;
    })
    .join("     ·     ");

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.style.animationDuration = `${Math.max(24, line.length * 0.08)}s`;
  }, [line]);

  return (
    <div className="tape">
      <div className="tape-label">LIVE TAPE</div>
      <div className="tape-viewport">
        <div className="tape-track" ref={trackRef}>
          <span>{line}</span>
          <span aria-hidden="true">{line}</span>
        </div>
      </div>
    </div>
  );
}
