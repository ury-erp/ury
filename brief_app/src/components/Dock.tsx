import { useState } from "react";
import { MicIcon, PhoneIcon, SendIcon } from "./Icons";
import { micSupported } from "../chat/recorder";

const STARTERS = ["How are we doing?", "Which dishes are slowest?", "How were sales yesterday?"];
const QUESTION: Record<string, string> = { "How are we doing?": "How are we doing compared with last week?" };

interface Props { onAsk: (q: string) => void; onMic: () => void; onCall?: () => void }

/** Pinned ask dock: starter chips, input, mic/send (the only solid buttons) and call. */
export default function Dock({ onAsk, onMic, onCall }: Props) {
  const [text, setText] = useState("");
  const canMic = micSupported();
  const submit = () => { const t = text.trim(); if (!t) return; setText(""); onAsk(t); };
  const sending = !!text.trim();
  return (
    <div className="dock">
      <div className="chips" role="group" aria-label="Suggested questions">
        {STARTERS.map((s) => <button key={s} type="button" className="chip-btn" onClick={() => onAsk(QUESTION[s] ?? s)}>{s}</button>)}
      </div>
      <form className="askrow" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="askin">
          <span className="sr">Ask</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about today…" enterKeyHint="send" autoComplete="off" dir="auto" />
          {sending ? (
            <button type="submit" className="rbtn acc" aria-label="Send message"><SendIcon size={24} /></button>
          ) : canMic ? (
            <button type="button" className="rbtn acc" aria-label="Voice message" onClick={onMic}><MicIcon size={24} /></button>
          ) : null}
        </label>
        {onCall && <button type="button" className="rbtn outline" aria-label="Call" onClick={onCall}><PhoneIcon size={24} /></button>}
      </form>
    </div>
  );
}
