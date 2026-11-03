import { useEffect, useMemo, useState } from "react";
import type { Chats } from "./useChats";
import ChatRow from "./ChatRow";
import { useRowMenu } from "./ChatActions";
import { CloseIcon, SearchIcon } from "../components/Icons";

interface Props { chats: Chats; onClose: () => void; onOpen: (id: string) => void }

export default function ChatsSheet({ chats, onClose, onOpen }: Props) {
  const [q, setQ] = useState("");
  const rm = useRowMenu(chats);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (!rm.active) onClose(); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose, rm.active]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (chats.rows ?? []).filter((r) => !t || `${r.title} ${r.preview ?? ""}`.toLowerCase().includes(t));
  }, [chats.rows, q]);

  return (
    <div className="scrim sheet-scrim" onClick={onClose}>
      <div className="sheet tall-sheet" role="dialog" aria-modal="true" aria-label="All questions" onClick={(e) => e.stopPropagation()}>
        <div className="grab" aria-hidden="true" />
        <div className="lh">
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={24} /></button>
          <h2>All questions</h2>
          <span className="lh-gap" />
        </div>
        <div className="lb">
          <label className="search"><SearchIcon size={22} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions" aria-label="Search" dir="auto" /></label>
          {chats.err ? (
            <p className="empty" role="alert">Could not load your chats. <button type="button" className="text-btn" onClick={chats.reload}>Try again</button></p>
          ) : chats.rows === null ? (
            <p className="empty" role="status">Loading chats</p>
          ) : list.length === 0 ? (
            <p className="empty">{q ? "No matches" : "No questions yet"}</p>
          ) : (
            <div className="recent flat">{list.map((r) => <ChatRow key={r.id} row={r} onOpen={() => onOpen(r.id)} onMenu={() => rm.open(r)} />)}</div>
          )}
        </div>
      </div>
      {rm.node}
    </div>
  );
}
