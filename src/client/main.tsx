import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./style.css";
import "./game-shell.css";

createRoot(document.getElementById("root")!).render(<App />);
