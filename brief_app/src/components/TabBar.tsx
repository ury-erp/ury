import type { ReactElement } from "react";
import { ChatIcon, DocIcon, PhoneIcon } from "./Icons";

export type Tab = "brief" | "ask" | "call";

export default function TabBar({ tab, onTab, huf, voice }: { tab: Tab; onTab: (t: Tab) => void; huf: boolean; voice?: boolean }) {
  const tabs: { id: Tab; label: string; icon: ReactElement }[] = [{ id: "brief", label: "Brief", icon: <DocIcon size={24} /> }];
  if (huf) tabs.push({ id: "ask", label: "Ask", icon: <ChatIcon size={24} /> });
  if (huf && voice) tabs.push({ id: "call", label: "Call", icon: <PhoneIcon size={24} /> });
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => onTab(t.id)}>
          <span className="tab-ico">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
