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
  const scrollables = ".audit-log, .archivist-frame, .overlay-panel, .epilogue, .debug-overlay";
  // capture: true fires before Phaser's canvas listeners (which call
  // stopPropagation), so preventDefault actually reaches the browser.
  document.addEventListener(
    "touchmove",
    (e) => {
      const target = e.target as Element | null;
      if (target && target.closest(scrollables)) return;
      e.preventDefault();
    },
    { capture: true, passive: false },
  );

  // Size the shell to the *visible* viewport, not the layout viewport. On
  // iPadOS WebKit a `position: fixed; inset: 0` body fills the (taller) layout
  // viewport, so the page can pan under the browser chrome and the status bar
  // scrolls off the top. visualViewport.height is the real visible height;
  // publish it as --app-height and cap the body to it (see index.css).
  const docEl = document.documentElement;
  const syncAppHeight = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    docEl.style.setProperty("--app-height", `${Math.round(h)}px`);
  };
  syncAppHeight();
  window.visualViewport?.addEventListener("resize", syncAppHeight);
  window.visualViewport?.addEventListener("scroll", syncAppHeight);
  window.addEventListener("resize", syncAppHeight);
  window.addEventListener("orientationchange", syncAppHeight);
}
