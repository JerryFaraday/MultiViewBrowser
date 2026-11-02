import { installOperationLog } from "./operation-log";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
installOperationLog();
createRoot(document.getElementById("root")!).render(<App />);
