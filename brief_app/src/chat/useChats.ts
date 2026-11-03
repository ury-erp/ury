import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";

export interface Undo { id: string; title: string }
const UNDO_MS = 5000;

/** Conversation list shared by Today (recent) and the chats sheet. Delete is optimistic with a 5s undo window. */
export function useChats(enabled: boolean) {
  const [rows, setRows] = useState<api.ConversationRow[] | null>(null);
  const [err, setErr] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [undo, setUndo] = useState<Undo | null>(null);
  const timer = useRef<number>();
  const pend = useRef<string | null>(null);

  const reload = useCallback(() => {
    if (!enabled) return;
    api.conversations().then((r) => { setRows(r); setErr(false); }, () => setErr(true));
  }, [enabled]);
  useEffect(reload, [reload]);

  const commit = useCallback(() => {
    const id = pend.current;
    clearTimeout(timer.current);
    pend.current = null;
    setUndo(null);
    if (!id) return;
    api.deleteConversation(id).catch(() => undefined).finally(() => { setHidden((h) => h.filter((x) => x !== id)); reload(); });
  }, [reload]);

  const remove = (row: api.ConversationRow) => {
    commit();
    pend.current = row.id;
    setHidden((h) => [...h, row.id]);
    setUndo({ id: row.id, title: row.title || "New chat" });
    timer.current = window.setTimeout(commit, UNDO_MS);
  };
  const undoRemove = () => {
    clearTimeout(timer.current);
    const id = pend.current; pend.current = null; setUndo(null);
    if (id) setHidden((h) => h.filter((x) => x !== id));
  };
  const rename = (id: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    setRows((r) => r && r.map((x) => (x.id === id ? { ...x, title: t } : x)));
    api.renameConversation(id, t).catch(reload);
  };
  useEffect(() => {
    const flush = () => { if (pend.current) commit(); };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [commit]);

  const visible = rows ? rows.filter((r) => !hidden.includes(r.id)) : null;
  return { rows: visible, err, reload, rename, remove, undo, undoRemove };
}
export type Chats = ReturnType<typeof useChats>;
