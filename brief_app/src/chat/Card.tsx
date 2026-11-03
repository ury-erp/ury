import { Bars, Spark } from "../components/Charts";
import { cardSummary, fmtDelta, fmtValue, safeLink, type Card } from "./cardFormat";

function Body({ c }: { c: Card }) {
  if (c.type === "kpi") {
    return (
      <dl className="card-kpis">
        {(c.kpis ?? []).map((k, i) => {
          const d = fmtDelta(k.delta);
          return (
            <div key={`${k.label}-${i}`} className="card-kpi">
              <dt>{k.label}</dt>
              <dd>
                <bdi>{fmtValue(k.value, k.fmt)}</bdi>
                {d && <span className={`card-delta ${d.dir}`}><bdi>{d.text}</bdi></span>}
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
              <tr key={i}>{r.map((x, j) => (j === 0 ? <th key={j} scope="row">{x}</th> : <td key={j}><bdi>{fmtValue(x, /qty|count|orders|no\.?$/i.test(c.cols?.[j] ?? "") ? "int" : "money")}</bdi></td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const series = (c.series ?? []).map((p) => ({ label: String(p.label), value: Number(p.value) || 0, value_text: fmtValue(p.value, c.fmt) }));
  if (c.type === "line") {
    return (
      <>
        <Spark series={series} />
        <div className="card-axis" aria-hidden="true"><span>{series[0]?.label}</span><span>{series[series.length - 1]?.label}</span></div>
      </>
    );
  }
  return <Bars series={series} />;
}

export default function CardView({ card }: { card: Card }) {
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
