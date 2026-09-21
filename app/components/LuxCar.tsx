"use client";
import { useMemo } from "react";

/** Side-profile luxury coupe used across Finance: glossy body, glass, rims, glowing lamps. */
export function LuxCar({ className = "", reflection = false }: { className?: string; reflection?: boolean }) {
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const body = "M12 64 C12 54 20 47 40 43 L62 27 C72 18 90 13 112 13 L154 13 C176 13 194 19 208 31 L238 41 C256 45 268 51 268 61 L268 67 C268 71 265 73 261 73 L234 73 A21 21 0 0 1 192 73 L102 73 A21 21 0 0 1 60 73 L19 73 C15 73 12 70 12 67 Z";
  const car = (
    <g>
      <path d={body} fill={`url(#lux-body-${uid})`} stroke="#6a5f66" strokeWidth="1" />
      <path d="M66 30 L112 18 L154 18 C170 18 184 23 194 32 L158 35 L112 36 Z" fill={`url(#lux-glass-${uid})`} />
      <path d="M130 18 L128 36" stroke="#0a090a" strokeWidth="2" opacity=".7" />
      <path d="M40 46 C70 40 120 38 194 38 L232 44" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity=".28" />
      <path d="M22 66 L258 66" stroke="#ff2f4f" strokeWidth="1.6" opacity=".9" style={{ filter: "drop-shadow(0 0 4px #ff2f4f)" }} />
      <path d="M244 47 L266 55 L266 60 L246 55 Z" fill="#fff8f0" style={{ filter: "drop-shadow(0 0 6px #ffd9b0)" }} />
      <path d="M13 56 L26 53 L26 58 L13 60 Z" fill="#ff2f4f" style={{ filter: "drop-shadow(0 0 5px #ff2f4f)" }} />
      <path d="M100 52 L116 52" stroke="#8f858b" strokeWidth="1.5" strokeLinecap="round" />
      {[81, 213].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="73" r="19" fill="#0a090a" stroke="#3d353a" strokeWidth="1" />
          <circle cx={cx} cy="73" r="12" fill="#151216" stroke="#a89ea4" strokeWidth="1.4" />
          {[0, 60, 120].map((a) => <line key={a} x1={cx} y1="73" x2={cx} y2="61" stroke="#c9c0c5" strokeWidth="2" transform={`rotate(${a} ${cx} 73)`} />)}
          {[0, 60, 120].map((a) => <line key={`b${a}`} x1={cx} y1="73" x2={cx} y2="85" stroke="#c9c0c5" strokeWidth="2" transform={`rotate(${a} ${cx} 73)`} />)}
          <circle cx={cx} cy="73" r="3" fill="#ff2f4f" />
        </g>
      ))}
    </g>
  );
  return (
    <svg viewBox={reflection ? "0 0 280 150" : "0 0 280 96"} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`lux-body-${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5a5058" /><stop offset=".45" stopColor="#221d20" /><stop offset="1" stopColor="#0d0b0d" /></linearGradient>
        <linearGradient id={`lux-glass-${uid}`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#6b6470" /><stop offset=".5" stopColor="#2a252a" /><stop offset="1" stopColor="#151216" /></linearGradient>
        <linearGradient id={`lux-fade-${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <mask id={`lux-mask-${uid}`}><rect x="0" y="0" width="280" height="96" fill={`url(#lux-fade-${uid})`} /></mask>
      </defs>
      {reflection && <g transform="translate(0,190) scale(1,-1)" mask={`url(#lux-mask-${uid})`} opacity=".9">{car}</g>}
      {car}
    </svg>
  );
}
