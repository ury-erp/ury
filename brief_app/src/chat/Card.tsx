import { Bars, Spark } from "../components/Charts";
import { cardSummary, dashboardLink, fmtDelta, fmtKpiValue, fmtValue, goodDirection, hideLoneKpiLabel, sameText, panelSubtitle, panelTitle, safeLink, toneClass, trendGlyph, trendWord, type Card, type DashboardPanel } from "./cardFormat";

function Body({ c, hideLabel = false }: { c: Card; hideLabel?: boolean }) {
  if (c.type === "kpi") {
    return (
      <dl className="card-kpis">
        {(c.kpis ?? []).map((k, i) => {
          const d = fmtDelta(k.delta);
          const glyph = trendGlyph(k.trend);
          const toned = k.tone != null || !!k.trend;
          return (
            <div key={`${k.label}-${i}`} className="card-kpi">
              <dt className={hideLabel ? "sr-only" : undefined}>{k.label}</dt>
              <dd>
                <bdi className="card-kpi-val" title={fmtValue(k.value, k.fmt)}>{fmtKpiValue(k.value, k.fmt)}</bdi>
                {toned && (glyph || d) ? (
                  <span className={`card-delta ${toneClass(k.tone)}`}>
                    {glyph && <span className="card-trend" aria-hidden="true">{glyph}</span>}
                    {k.trend && <span className="sr-only">{trendWord(k.trend)}</span>}
                    {d && <bdi>{d.text}</bdi>}
                  </span>
                ) : d && <span className={`card-delta ${d.dir}`}><bdi>{d.text}</bdi></span>}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }
  if (c.type === "table") {
    return (
      <div className="card-table-wrap">
        <table className="card-table">
          <thead><tr>{(c.cols ?? []).map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {(c.rows ?? []).map((r, i) => (
              <tr key={i}>{r.map((x, j) => (j === 0 ? <th key={j} scope="row" title={x == null ? undefined : String(x)}>{x}</th> : <td key={j}><bdi>{fmtValue(x, /qty|count|orders|no\.?$/i.test(c.cols?.[j] ?? "") ? "int" : "money")}</bdi></td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const gd = goodDirection(c);
  const series = (c.series ?? []).map((p) => ({ label: String(p.label), value: Number(p.value) || 0, value_text: fmtValue(p.value, c.fmt) }));
  if (c.type === "line") {
    return (
      <>
        <Spark series={series} goodDir={gd} />
        {gd && <PeakKey series={series} gd={gd} />}
        <div className="card-axis" aria-hidden="true"><span>{series[0]?.label}</span><span>{series[series.length - 1]?.label}</span></div>
      </>
    );
  }
  return <><Bars series={series} goodDir={gd} />{gd && <PeakKey series={series} gd={gd} />}</>;
}

const same = sameText;

function Panel({ p, dashTitle }: { p: DashboardPanel; dashTitle?: string }) {
  let title = panelTitle(p); const sub = panelSubtitle(p);
  const c = { ...p.card, title: undefined, subtitle: undefined };
  const hideLabel = hideLoneKpiLabel(p.card, title);
  if (same(title, dashTitle)) title = "";
  return (
    <section className={`dash-panel span-${p.span}`} aria-label={title || undefined}>
      {title && <h4 className="dash-panel-title" dir="auto" title={title}>{title}</h4>}
      {sub && <p className="dash-panel-sub" dir="auto" title={sub}>{sub}</p>}
      <div className="card-body"><Body c={c} hideLabel={hideLabel} /></div>
      {p.caption && <p className="dash-caption" dir="auto">{p.caption}</p>}
      {p.composed && <p className="card-note">Composed by the assistant</p>}
    </section>
  );
}

function DashboardCard({ card }: { card: Card }) {
  const link = dashboardLink(card);
  return (
    <figure className="card card-dashboard" aria-label={cardSummary(card)}>
      <header className="dash-head">
        {card.title && <h3 className="dash-title" dir="auto">{card.title}</h3>}
        {card.subtitle && <p className="dash-sub" dir="auto"><bdi>{card.subtitle}</bdi></p>}
        {card.subtext && <p className="dash-subtext" dir="auto">{card.subtext}</p>}
      </header>
      <div className="dash-grid">{(card.panels ?? []).map((p, i) => <Panel key={p.id ?? i} p={p} dashTitle={card.title} />)}</div>
      {card.footnote && <p className="dash-foot" dir="auto">{card.footnote}</p>}
      {link && <a className="card-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label || "Open dashboard"}</a>}
    </figure>
  );
}

/** Text key for the coloured peak/low markers (colour is never the only cue). */
function PeakKey({ series, gd }: { series: { label: string; value: number; value_text: string }[]; gd: "up" | "down" }) {
  if (series.length < 2) return null;
  const hi = series.reduce((a, b) => (b.value > a.value ? b : a)), lo = series.reduce((a, b) => (b.value < a.value ? b : a));
  if (hi.value === lo.value) return null;
  return (
    <p className="card-peaks">
      <span className={gd === "down" ? "bad" : "good"}><span aria-hidden="true">▲ </span>Peak <bdi>{hi.label} {hi.value_text}</bdi></span>
      <span className={gd === "down" ? "good" : "bad"}><span aria-hidden="true">▼ </span>Low <bdi>{lo.label} {lo.value_text}</bdi></span>
    </p>
  );
}

export default function CardView({ card }: { card: Card }) {
  if (card.type === "dashboard") return <DashboardCard card={card} />;
  const link = safeLink(card.link);
  return (
    <figure className={`card card-${card.type}`} aria-label={cardSummary(card)}>
      {card.title && <figcaption className="card-title" dir="auto">{card.title}{card.subtitle && <span className="card-sub"><bdi>{card.subtitle}</bdi></span>}</figcaption>}
      <div className="card-body">
        <Body c={card} />
      </div>
      {card.ai_composed === true && <p className="card-note">Composed by the assistant from your data. Check the dashboard to confirm.</p>}
      {link && <a className="card-link" href={link.url} target="_blank" rel="noopener noreferrer">Open dashboard</a>}
    </figure>
  );
}

export function Cards({ cards }: { cards?: Card[] }) {
  if (!cards?.length) return null;
  return <div className="cards">{cards.map((c, i) => <CardView key={i} card={c} />)}</div>;
}
