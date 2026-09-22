"use client";
import { useState } from "react";

/**
 * Small, dependency-free chart pieces shared by the Automations, Forms and
 * Studio dashboards. One axis per chart, thin marks, a hover tooltip, and a
 * legend whenever more than one series is drawn.
 */
export type Series = { key: string; label: string; color: string };
export type Point = { day: string; [k: string]: number | string };

export const INK = { accent: "#ff2f4f", good: "#3fd982", warn: "#f3b23a", muted: "#5f565b", cool: "#5aa9ff" };

const dayLabel = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return d.toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" }); };
export const fmt = (n: number) => n.toLocaleString();
export const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

/** Stacked daily bars. Every series shares the same unit (a count of the same thing, split by outcome). */
export function DayBars({ points, series, height = 150, unit = "" }: { points: Point[]; series: Series[]; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number>(-1);
  const totals = points.map((p) => series.reduce((s, x) => s + Number(p[x.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const W = 720, H = height, padL = 34, padB = 22, padT = 8;
  const innerW = W - padL - 6, innerH = H - padB - padT;
  const n = points.length || 1;
  const slot = innerW / n;
  const barW = Math.max(3, Math.min(18, slot - 2));
  const ticks = [0, Math.ceil(max / 2), max];
  const hp = hover >= 0 ? points[hover] : null;
  return (
    <div className="inChart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily totals" onMouseLeave={() => setHover(-1)}>
        {ticks.map((t) => { const y = padT + innerH - (t / max) * innerH; return <g key={t}><line x1={padL} x2={W - 6} y1={y} y2={y} className="inGrid" /><text x={padL - 6} y={y + 3} className="inTick" textAnchor="end">{t}</text></g>; })}
        {points.map((p, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          let yTop = padT + innerH;
          return (
            <g key={p.day} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
              {series.map((s, k) => {
                const v = Number(p[s.key] || 0); const h = (v / max) * innerH; if (!v) return null;
                yTop -= h; const gapped = Math.max(0, h - (k ? 2 : 0));
                return <rect key={s.key} x={x} y={yTop + (k ? 2 : 0)} width={barW} height={gapped} rx={k === series.length - 1 || yTop === padT + innerH - h ? 3 : 0} fill={s.color} opacity={hover === -1 || hover === i ? 1 : 0.45} />;
              })}
              {(i === 0 || i === n - 1 || ((n > 14 ? i % 7 === 0 : i % 2 === 0) && n - 1 - i > 2)) && <text x={padL + i * slot + slot / 2} y={H - 6} className="inTick" textAnchor="middle">{dayLabel(p.day)}</text>}
            </g>
          );
        })}
        {hp && <line x1={padL + hover * slot + slot / 2} x2={padL + hover * slot + slot / 2} y1={padT} y2={padT + innerH} className="inCross" />}
      </svg>
      {hp && (
        <div className={`inTip ${hover > n * 0.7 ? "right" : ""}`} style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }}>
          <b>{dayLabel(hp.day)}</b>
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}<em>{fmt(Number(hp[s.key] || 0))}{unit}</em></span>)}
          {series.length > 1 && <span className="tot">Total<em>{fmt(totals[hover])}{unit}</em></span>}
        </div>
      )}
      {series.length > 1 && <div className="inLegend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>}
    </div>
  );
}

/** Horizontal breakdown bars in one hue: magnitude only, labels carry identity. */
export function Breakdown({ items, color = INK.accent, empty = "Nothing yet." }: { items: { label: string; n: number; hint?: string }[]; color?: string; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  if (!items.length) return <div className="fxCCEmpty">{empty}</div>;
  return (
    <div className="fxCCBars inBreak">
      {items.map((it) => <div key={it.label} title={`${it.label}: ${fmt(it.n)}`}><span><b>{it.label}{it.hint ? <small> · {it.hint}</small> : null}</b><em>{fmt(it.n)}</em></span><i><b style={{ width: `${Math.round((it.n / max) * 100)}%`, background: color, boxShadow: "none" }} /></i></div>)}
    </div>
  );
}

/** Period-over-period delta pill. */
export function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return <span className="inDelta flat">no change</span>;
  if (!prev) return <span className="inDelta up">new</span>;
  const d = Math.round(((now - prev) / prev) * 100);
  return <span className={`inDelta ${d > 0 ? "up" : d < 0 ? "down" : "flat"}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d)}% vs prior period</span>;
}

export function RangeChips({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return <div className="fxLendChips inRange">{[7, 30, 90].map((d) => <button key={d} className={days === d ? "on" : ""} onClick={() => onChange(d)}>{d} days</button>)}</div>;
}
