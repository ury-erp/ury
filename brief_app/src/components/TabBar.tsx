export type Tab = "brief" | "ask" | "call";

export default function TabBar({ tab, onTab, huf, voice }: { tab: Tab; onTab: (t: Tab) => void; huf: boolean; voice?: boolean }) {
  const tabs: { id: Tab; label: string }[] = [{ id: "brief", label: "Brief" }];
  if (huf) tabs.push({ id: "ask", label: "Ask" });
  if (huf && voice) tabs.push({ id: "call", label: "Call" });
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => onTab(t.id)}>{t.label}</button>
      ))}
    </nav>
  );
}
