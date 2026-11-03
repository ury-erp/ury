import { useEffect, useState, type ReactNode } from "react";
import type { ConversationRow } from "./api";
import type { Chats } from "./useChats";
import { EditIcon, DeleteIcon } from "../components/Icons";

/** Row menu (Rename / Delete) plus the rename dialog. Returns an opener and the element to render. */
export function useRowMenu(chats: Chats): { open: (r: ConversationRow) => void; node: ReactNode; active: boolean } {
  const [menu, setMenu] = useState<ConversationRow | null>(null);
  const [renaming, setRenaming] = useState<ConversationRow | null>(null);
  const [name, setName] = useState("");
  const active = !!(menu || renaming);
  useEffect(() => {
    if (!active) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); if (renaming) setRenaming(null); else setMenu(null); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [active, renaming]);

  const node = (
    <>
      {menu && (
        <div className="scrim menu-scrim" onClick={(e) => { e.stopPropagation(); setMenu(null); }}>
          <div className="sheet actions" role="menu" onClick={(e) => e.stopPropagation()}>
            <p className="actions-t" dir="auto">{menu.title || "New chat"}</p>
            <button type="button" role="menuitem" onClick={() => { setRenaming(menu); setName(menu.title); setMenu(null); }}><EditIcon size={22} />Rename</button>
            <button type="button" role="menuitem" className="danger" onClick={() => { chats.remove(menu); setMenu(null); }}><DeleteIcon size={22} />Delete</button>
          </div>
        </div>
      )}
      {renaming && (
        <div className="scrim dialog-scrim" onClick={(e) => { e.stopPropagation(); setRenaming(null); }}>
          <form className="dialog" role="dialog" aria-modal="true" aria-label="Rename" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); chats.rename(renaming.id, name); setRenaming(null); }}>
            <h3>Rename question</h3>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} dir="auto" aria-label="Title" maxLength={140} />
            <div className="dialog-r">
              <button type="button" className="quiet" onClick={() => setRenaming(null)}>Cancel</button>
              <button type="submit" className="tonal" disabled={!name.trim()}>Save</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
  return { open: setMenu, node, active };
}
