import type { Point } from "../types";
import { amount } from "../format";

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];

export function Spark({ series }: { series: Point[] }) {
  const w = 300, h = 100, pad = 8;
  const vals = series.map((p) => Number(p.value) || 0);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => [
    series.length > 1 ? pad + (i * (w - 2 * pad)) / (series.length - 1) : w / 2,
    h - pad - ((v - min) / span) * (h - 2 * pad),
  ]);
  const last = pts[pts.length - 1];
  return (
    <div className="spark-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Sales for the last ${series.length} days`}>
        <polyline points={pts.map((p) => p.map((x) => x.toFixed(1)).join(",")).join(" ")} fill="none" stroke="var(--spark)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {last && <circle cx={last[0]} cy={last[1]} r="5" fill="var(--spark)" />}
      </svg>
    </div>
  );
}

export function Donut({ series }: { series: Point[] }) {
  const total = series.reduce((a, p) => a + (Number(p.value) || 0), 0);
  const r = 40, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <>
      <div className="chart">
        <svg viewBox="0 0 120 120" width="200" height="200" role="img" aria-label="Share by group">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="18" />
          {total > 0 && series.map((p, i) => {
            const len = ((Number(p.value) || 0) / total) * c;
            const el = <circle key={p.label} cx="60" cy="60" r={r} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="18" strokeDasharray={`${len.toFixed(2)} ${(c - len).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} transform="rotate(-90 60 60)" />;
            off += len;
            return el;
          })}
        </svg>
      </div>
      <ul className="legend">
        {series.map((p, i) => (
          <li key={p.label}>
            <span className="sw" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
            <span>{p.label}</span>
            <span className="pct">{total > 0 ? Math.round(((Number(p.value) || 0) / total) * 100) : 0}%</span>
            <span className="amt">{amount(p.value_text, p.value)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Horizontal bars. `ranked` prefixes a rank number. Negative values are drawn at zero width. */
export function Bars({ series, ranked = false }: { series: Point[]; ranked?: boolean }) {
  const max = Math.max(0, ...series.map((p) => Number(p.value) || 0)) || 1;
  return (
    <ul className="bars">
      {series.map((p, i) => (
        <li key={`${p.label}-${i}`}>
          <span className="bar-label">{ranked && <b className="bar-rank">{i + 1}</b>}{p.label}</span>
          <span className="bar-amt">{amount(p.value_text, p.value)}</span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${Math.max(0, ((Number(p.value) || 0) / max) * 100).toFixed(1)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
