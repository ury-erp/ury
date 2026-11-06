import { createRoot } from "react-dom/client";
import App from "./App";
import Go from "./go/Go";
import "./styles.css";
import { applyTheme } from "./settings/prefs";

applyTheme();

const isGo = location.pathname.replace(/\/+$/, "") === "/ury/brief/go";
createRoot(document.getElementById("root")!).render(isGo ? <Go /> : <App />);

// iOS ignores interactive-widget: size the shell to the visual viewport so the composer rides on the keyboard.
const vv = window.visualViewport;
const sync = () => {
  const h = vv ? vv.height : innerHeight;
  const root = document.documentElement;
  root.style.setProperty("--app-h", `${h}px`);
  root.toggleAttribute("data-kb", innerHeight - h > 120);
  if (vv && vv.offsetTop) scrollTo(0, 0);
};
vv?.addEventListener("resize", sync);
vv?.addEventListener("scroll", sync);
sync();
for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
