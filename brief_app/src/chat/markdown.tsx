import type { ReactNode } from "react";

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : p);
}

/** Markdown-lite: paragraphs, bullets, bold. No HTML is ever injected. */
export default function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) { out.push(<ul key={out.length}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>); bullets = []; }
  };
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const m = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    if (m) bullets.push(m[1]);
    else { flush(); if (line.trim()) out.push(<p key={out.length}>{inline(line.trim())}</p>); }
  }
  flush();
  return <div className="md" dir="auto">{out}</div>;
}
