import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { beenden, rpc } from "./api";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
window.setInterval(() => { rpc("ping").catch(() => undefined); }, 5000);
window.addEventListener("pagehide", beenden);
