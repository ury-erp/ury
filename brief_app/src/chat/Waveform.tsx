import { useEffect, useState } from "react";

const BARS = 36;

/** Live mic meter: rolling bars sampled from getLevel() so the user sees the mic is hearing them. */
export default function Waveform({ getLevel }: { getLevel: () => number }) {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  useEffect(() => {
    const id = setInterval(() => setLevels((l) => [...l.slice(1), getLevel()]), 70);
    return () => clearInterval(id);
  }, [getLevel]);
  return (
    <div className="wave" aria-hidden="true">
      {levels.map((v, i) => <i key={i} style={{ height: `${Math.max(12, Math.round(v * 100))}%` }} />)}
    </div>
  );
}
