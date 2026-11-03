import type { Slide } from "../types";
import { Spark, Donut, Bars } from "./Charts";
import { amount } from "../format";
import { askAbout, dashboardId, factsOf } from "../today";

interface Props { slide: Slide; onAsk: (q: string) => void; onDashboard: (id: string) => void }

export default function FeedCard({ slide, onAsk, onDashboard }: Props) {
  const series = slide.chart?.series || [];
  const type = slide.chart?.type;
  const facts = factsOf(slide);
  const unavailable = slide.status === "unavailable";
  const dash = dashboardId(slide.drill);
  return (
    <article className="fcard" data-slide-id={slide.id}>
      <h3 dir="auto">{slide.title}</h3>
      <p className="sub" dir="auto">{slide.headline}</p>
      {unavailable ? (
        <p className="dq" dir="auto"><b>Not recorded yet:</b> this figure is not set up. It fills in once it is.</p>
      ) : type === "spark" && series.length > 0 ? (
        <Spark series={series} />
      ) : type === "rank" ? (
        <Bars series={series} ranked />
      ) : slide.id === "top_bottom_items" && (slide.top || slide.bottom) ? (
        <>
          {!!slide.top?.length && <><p className="sub">Top sellers</p><Bars series={slide.top} /></>}
          {!!slide.bottom?.length && <><p className="sub">Slowest sellers</p><Bars series={slide.bottom} /></>}
        </>
      ) : type === "bar" ? (
        <Bars series={series} />
      ) : type === "donut" ? (
        <>
          <Donut series={series} />
          {slide.value != null && <p className="sub">Total {amount(slide.value_text, slide.value)}</p>}
        </>
      ) : null}
      {facts.length > 0 && (
        <div className="facts">
          {facts.map((f, i) => <div key={i} className="fact"><b>{f.v}</b><span dir="auto">{f.l}</span></div>)}
        </div>
      )}
      {slide.data_quality === "partial" && !unavailable && <p className="dq" dir="auto"><b>Partial data:</b> some days or values are missing.</p>}
      <div className="acts">
        <button type="button" className="tonal" onClick={() => onAsk(askAbout(slide))}>Ask about this</button>
        {dash ? <button type="button" className="quiet" onClick={() => onDashboard(dash)}>Dashboard &rsaquo;</button>
          : slide.drill ? <a className="quiet" href={slide.drill}>Dashboard &rsaquo;</a> : null}
      </div>
    </article>
  );
}
