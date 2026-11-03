import { useRef } from "react";
import type { ConversationRow } from "./api";
import { langHint } from "./api";
import { parseServerTime, rowTime } from "./when";
import { MicIcon, SparkleIcon, KebabIcon } from "../components/Icons";

interface Props { row: ConversationRow; onOpen: () => void; onMenu: () => void }

/** Preview row: glyph, title, one-line preview, time, pending dot. Long-press, right-click or kebab opens the menu. */
export default function ChatRow({ row, onOpen, onMenu }: Props) {
  const lp = useRef<number>();
  const fired = useRef(false);
  const at = parseServerTime(row.last_at) ?? parseServerTime(row.created_at);
  const prev = row.pending ? "Thinking…" : row.preview ? `${row.last_role === "user" ? "You: " : ""}${row.preview}` : "";
  const clear = () => clearTimeout(lp.current);
  return (
    <div
      className="crow" role="button" tabIndex={0}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest(".crow-more")) return; fired.current = false; lp.current = window.setTimeout(() => { fired.current = true; onMenu(); }, 500); }}
      onPointerUp={clear} onPointerLeave={clear} onPointerCancel={clear}
      onContextMenu={(e) => { e.preventDefault(); onMenu(); }}
      onClick={() => { if (fired.current) { fired.current = false; return; } onOpen(); }}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
    >
      <span className="glyph">{row.started_by_voice ? <MicIcon size={20} /> : <SparkleIcon size={20} />}</span>
      <span className="crow-t">
        <b dir="auto">{row.title || "New chat"}</b>
        {prev && <span dir="auto" className={row.pending ? "pend" : undefined}>{prev}</span>}
      </span>
      {row.pending && <span className="pdot" aria-hidden="true" />}
      {at && <time>{rowTime(at, new Date(), langHint())}</time>}
      <button type="button" className="crow-more" aria-label="More" onClick={(e) => { e.stopPropagation(); onMenu(); }}><KebabIcon size={20} /></button>
    </div>
  );
}
