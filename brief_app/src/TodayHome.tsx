import { useMemo } from "react";
import type { Brief } from "./types";
import TopBar from "./components/TopBar";
import Dock from "./components/Dock";
import FeedCard from "./components/FeedCard";
import ChatRow from "./chat/ChatRow";
import { useRowMenu } from "./chat/ChatActions";
import type { Chats } from "./chat/useChats";
import { canRender } from "./components/SlideView";
import { ArrowDownIcon, ArrowUpIcon } from "./components/Icons";
import { amount } from "./format";
import { deltaOf, heroSlide, tilesOf } from "./today";

interface Props {
  brief: Brief;
  subtitle: string;
  title: string;
  initials: string;
  huf: boolean;
  voice: boolean;
  chats: Chats;
  hidden?: boolean;
  onAsk: (q: string) => void;
  onMic: () => void;
  onCall: () => void;
  onOpenChat: (id: string) => void;
  onSeeAll: () => void;
  onDashboard: (id: string) => void;
  onSettings: () => void;
  onInstall?: () => void;
  onWhatsApp?: () => void;
  onSignOut: () => void;
}

export default function TodayHome(p: Props) {
  const { brief, chats } = p;
  const hero = useMemo(() => heroSlide(brief.slides), [brief.slides]);
  const tiles = useMemo(() => tilesOf(brief.slides, hero), [brief.slides, hero]);
  const feed = useMemo(() => brief.slides.filter((s) => s !== hero && canRender(s)), [brief.slides, hero]);
  const delta = hero ? deltaOf(hero) : null;
  const rm = useRowMenu(chats);
  const recent = (chats.rows ?? []).slice(0, 3);

  return (
    <div className="today" hidden={p.hidden}>
      <TopBar title={p.title} subtitle={p.subtitle} initials={p.initials} onSettings={p.onSettings} onInstall={p.onInstall} onWhatsApp={p.onWhatsApp} onSignOut={p.onSignOut} />
      <main className="today-body" tabIndex={-1}>
        {hero ? (
          <section className="hero" aria-label="Net sales">
            <p className="lbl" dir="auto">Net sales · {hero.title}</p>
            <p className="big">{amount(hero.value_text, hero.value)}</p>
            {delta && (
              <span className={`pill ${delta.tone}`}>
                {delta.tone === "bad" || delta.text.startsWith("-") ? <ArrowDownIcon size={18} /> : <ArrowUpIcon size={18} />}
                {delta.text}
              </span>
            )}
          </section>
        ) : null}
        {tiles.length > 0 && (
          <section className="grid" aria-label="Key numbers">
            {tiles.map((t) => {
              const inner = (<><span className="k">{t.k}</span><span className="v">{t.v}</span>{t.d && <span className="d">{t.d}</span>}</>);
              return p.huf
                ? <button key={t.id} type="button" className="tile" onClick={() => p.onAsk(t.q)}>{inner}</button>
                : <div key={t.id} className="tile">{inner}</div>;
            })}
          </section>
        )}
        {feed.length > 0 && <h2 className="sec">Today&rsquo;s story</h2>}
        {feed.map((s) => <FeedCard key={s.id} slide={s} onAsk={p.huf ? p.onAsk : () => undefined} onDashboard={p.onDashboard} />)}
        {!hero && feed.length === 0 && <div className="state"><h2>No brief yet</h2><p className="sub">There is nothing to show for this date.</p></div>}
        {p.huf && recent.length > 0 && (
          <>
            <h2 className="sec">Recent questions</h2>
            <div className="recent">
              {recent.map((r) => <ChatRow key={r.id} row={r} onOpen={() => p.onOpenChat(r.id)} onMenu={() => rm.open(r)} />)}
            </div>
            <button type="button" className="quiet seeall" onClick={p.onSeeAll}>See all</button>
          </>
        )}
      </main>
      {p.huf && <Dock onAsk={p.onAsk} onMic={p.onMic} onCall={p.voice ? p.onCall : undefined} />}
      {rm.node}
    </div>
  );
}
