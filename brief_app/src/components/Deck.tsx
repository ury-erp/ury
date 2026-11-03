import { useCallback, useEffect, useRef, useState } from "react";
import type { Slide } from "../types";
import { SlideView, canRender } from "./SlideView";

export default function Deck({ slides }: { slides: Slide[] }) {
  const items = slides.filter(canRender);
  const ref = useRef<HTMLElement>(null);
  const [cur, setCur] = useState(0);
  const rtl = typeof document !== "undefined" && document.dir === "rtl";

  const goTo = useCallback((i: number) => {
    const el = ref.current;
    if (!el || i < 0 || i >= items.length) return;
    el.scrollTo({ left: (rtl ? -1 : 1) * i * el.clientWidth });
  }, [items.length, rtl]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(Math.abs(el.scrollLeft) / (el.clientWidth || 1));
    setCur(Math.max(0, Math.min(items.length - 1, i)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo(cur + (rtl ? 1 : -1));
      else if (e.key === "ArrowRight") goTo(cur + (rtl ? -1 : 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cur, goTo, rtl]);

  if (!items.length) return <div className="state"><h2>No brief yet</h2><p className="sub">There is nothing to show for this date.</p></div>;
  return (
    <>
      <main className="deck" ref={ref} onScroll={onScroll} tabIndex={-1} aria-label="Owner brief slides">
        {items.map((s, i) => <SlideView key={s.id} slide={s} index={i} total={items.length} />)}
      </main>
      <nav className="nav" aria-label="Slide navigation">
        <button type="button" onClick={() => goTo(cur - 1)} disabled={cur === 0} aria-label="Previous slide">&#8592;</button>
        <div className="dots">
          {items.map((s, i) => (
            <button key={s.id} type="button" className="dot" aria-label={`Go to slide ${i + 1}`} aria-current={i === cur ? "true" : undefined} onClick={() => goTo(i)} />
          ))}
        </div>
        <button type="button" onClick={() => goTo(cur + 1)} disabled={cur >= items.length - 1} aria-label="Next slide">&#8594;</button>
      </nav>
      <div className="sr" aria-live="polite" aria-atomic="true">{`${cur + 1} of ${items.length}: ${items[cur]?.title ?? ""}`}</div>
    </>
  );
}
