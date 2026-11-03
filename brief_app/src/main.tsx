import { createRoot } from "react-dom/client";
import App from "./App";
import Go from "./go/Go";
import "./styles.css";
import { applyTheme } from "./settings/prefs";

applyTheme();

const isGo = location.pathname.replace(/\/+$/, "") === "/ury/brief/go";
createRoot(document.getElementById("root")!).render(isGo ? <Go /> : <App />);
