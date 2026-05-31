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

// iOS Safari rubber-band guard: block touchmove gestures except inside
// elements that legitimately scroll. Must be { passive: false } so
// preventDefault actually fires — Safari defaults touchmove to passive.
if (typeof window !== "undefined") {
  const scrollables = ".audit-log, .overlay-panel, .epilogue, .debug-overlay";
  document.addEventListener(
    "touchmove",
    (e) => {
      const target = e.target as Element | null;
      if (target && target.closest(scrollables)) return;
      e.preventDefault();
    },
    { passive: false },
  );
}
