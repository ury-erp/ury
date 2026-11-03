import type { Slide } from "../types";
import { Spark, Donut, Bars } from "./Charts";
import { amount } from "../format";

function Delta({ slide }: { slide: Slide }) {
  const d = slide.delta_pct;
  if (d == null) return null;
  const label = slide.delta_label ?? `${Math.abs(Math.round(d * 1000) / 10)}%`;
  const arrow = d > 0.0005 ? "\u25B2" : d < -0.0005 ? "\u25BC" : "\u25AC";
  const sign = d > 0.0005 ? "+" : d < -0.0005 ? "-" : "";
  return (
    <span className={`chip ${slide.tone || "neutral"}`} aria-label={`${d >= 0 ? "Up" : "Down"} ${label} compared with before`}>
      {arrow} {sign}{label}
    </span>
  );
}

/** Every slide with a headline is shown; unknown chart types fall back to the headline alone. */
export function canRender(s: Slide): boolean {
  return !!s.headline || s.status === "unavailable";
}


export function SlideView({ slide, index, total }: { slide: Slide; index: number; total: number }) {
  const series = slide.chart?.series || [];
  const type = slide.chart?.type;
  const spark = slide.id === "yesterday" || slide.chart?.type === "spark";
  return (
    <section className="slide" aria-roledescription="slide" aria-label={`${index + 1} of ${total}: ${slide.title}`} data-slide-id={slide.id}>
      <div className="card">
        <p className="title" dir="auto">{slide.title}</p>
        <h2 dir="auto">{slide.headline}</h2>
        {slide.status === "unavailable" ? (
          <p className="dq" dir="auto"><b>Not recorded yet.</b></p>
        ) : spark ? (
          <>
            {slide.value != null && <div className="value">{amount(slide.value_text, slide.value)}</div>}
            <div className="row">
              <Delta slide={slide} />
              {slide.orders != null && (
                <span className="sub">{slide.orders} orders{slide.orders_compare != null ? ` vs ${slide.orders_compare}` : ""}</span>
              )}
            </div>
            {series.length > 0 && (<><Spark series={series} /><p className="sub">Last {series.length} days</p></>)}
          </>
        ) : type === "rank" ? (
          <Bars series={series} ranked />
        ) : slide.id === "top_bottom_items" && (slide.top || slide.bottom) ? (
          <>
            {!!slide.top?.length && (<><p className="sub">Top sellers</p><Bars series={slide.top} /></>)}
            {!!slide.bottom?.length && (<><p className="sub">Slowest sellers</p><Bars series={slide.bottom} /></>)}
          </>
        ) : type === "bar" ? (
          <Bars series={series} />
        ) : type === "donut" ? (
          <>
            <Donut series={series} />
            {slide.value != null && <p className="sub">Total {amount(slide.value_text, slide.value)}</p>}
          </>
        ) : null}
        {slide.data_quality === "partial" && slide.status !== "unavailable" && <p className="dq" dir="auto"><b>Partial data:</b> some days or values are missing.</p>}
        {slide.drill && <a className="drill" href={slide.drill}>Open full dashboard &rarr;</a>}
      </div>
    </section>
  );
}
