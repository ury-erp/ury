import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import { groupKey, parseServerTime, relativeLabel } from "./when";
import { BackIcon, ChevronIcon } from "../components/Icons";

interface Props { activeId: string | null; onPick: (id: string) => void; onClose: () => void }
interface Item { id: string; title: string; at: Date; }

export default function History({ activeId, onPick, onClose }: Props) {
  const [rows, setRows] = useState<api.ConversationRow[] | null>(null);
  const [err, setErr] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const load = useCallback(() => {
    setErr(false); setRows(null);
    api.conversations().then(setRows, () => setErr(true));
  }, []);
  useEffect(() => { load(); back.current?.focus(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const locale = api.langHint();
  const groups = useMemo(() => {
    const now = new Date();
    const out: { key: string; label: string; items: Item[] }[] = [];
    for (const r of rows ?? []) {
      const at = parseServerTime(r.last_at) ?? parseServerTime(r.created_at) ?? new Date(0);
      const g = groupKey(at, now, locale);
      let cur = out[out.length - 1];
      if (!cur || cur.key !== g.key) { cur = { ...g, items: [] }; out.push(cur); }
      cur.items.push({ id: r.id, title: r.title || "New chat", at });
    }
    return out;
  }, [rows, locale]);
  const now = new Date();

  return (
    <div className="hist" role="dialog" aria-modal="true" aria-label="Chats">
      <div className="hist-bar">
        <button ref={back} type="button" className="sub-btn" aria-label="Back to chat" onClick={onClose}><BackIcon size={24} /></button>
        <h2>Chats</h2>
      </div>
      <div className="hist-body">
        {err ? (
          <div className="hist-state" role="alert"><p>Could not load your chats.</p><button type="button" className="retry" onClick={load}>Try again</button></div>
        ) : rows === null ? (
          <div className="hist-state" role="status">Loading chats</div>
        ) : rows.length === 0 ? (
          <div className="hist-state"><p>No chats yet</p></div>
        ) : groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="hist-head">{g.label}</h3>
            <ul className="hist-list">
              {g.items.map((it) => (
                <li key={it.id}>
                  <button type="button" className={`hist-row${it.id === activeId ? " active" : ""}`} aria-current={it.id === activeId ? "true" : undefined} onClick={() => onPick(it.id)}>
                    <span className="hist-title" dir="auto">{it.title}</span>
                    <span className="hist-when">{relativeLabel(it.at, now, locale)}</span>
                    <ChevronIcon size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
