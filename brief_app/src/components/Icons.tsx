// Inline Material-style icons (viewBox 24). currentColor, decorative.
import type { ReactElement } from "react";

interface P { size?: number }
const mk = (d: ReactElement | string) => ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

export const MicIcon = mk("M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z");
export const SendIcon = mk("M2.01 21 23 12 2.01 3 2 10l15 2-15 2z");
export const PlayIcon = mk("M8 5v14l11-7z");
export const PauseIcon = mk("M6 19h4V5H6zm8-14v14h4V5z");
export const PhoneIcon = mk("M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.4 11.4 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02z");
export const KebabIcon = mk(<><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></>);
export const BackIcon = mk("M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z");
export const CloseIcon = mk("M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z");
export const ChatIcon = mk("M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z");
export const DocIcon = mk("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM8 13h8v2H8zm0 4h8v2H8z");
export const TickIcon = mk("M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z");
export const DoubleTickIcon = mk("M18 7l-1.41-1.41-6.34 6.34 1.41 1.41zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12zM.41 13.41 6 19l1.41-1.41L1.83 12z");
export const HistoryIcon = mk("M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z");
export const NewChatIcon = mk("M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75zM4 4h8V2H4a2 2 0 0 0-2 2v16h2z");
export const ChevronIcon = mk("M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z");
