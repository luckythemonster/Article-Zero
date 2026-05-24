import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const spike =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("spike") === "arwes";

const root = createRoot(document.getElementById("root")!);
root.render(
  spike ? (
    <App />
  ) : (
    <StrictMode>
      <App />
    </StrictMode>
  ),
);
