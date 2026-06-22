import ErrorBoundary from "./components/ErrorBoundary";
import TerminalShell from "./shell/TerminalShell";
import AlignmentSessionUI from "./components/AlignmentSessionUI";
import { useState } from "react";
import ArwesSmokeTest from "./spike/ArwesSmokeTest";

export default function App() {
  const [showAlignmentSessionUI, setShowAlignmentSessionUI] = useState(false);
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("spike") === "arwes"
  ) {
    return <ArwesSmokeTest />;
  }
  // Wrap the shell so a render error in any overlay shows a fallback instead of
  // crashing the whole UI mid-turn. The Phaser canvas runs outside React, so it
  // is unaffected by boundary trips.
  return (
    <ErrorBoundary>
      {showAlignmentSessionUI && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000 }}>
          <AlignmentSessionUI />
          <button
            onClick={() => setShowAlignmentSessionUI(false)}
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              zIndex: 100001,
              padding: "8px 16px",
              background: "#C0001A",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontFamily: "monospace",
              fontWeight: "bold"
            }}
          >
            [X] CLOSE ALIGNMENT UI
          </button>
        </div>
      )}
      <TerminalShell />
      <button
        onClick={() => setShowAlignmentSessionUI(true)}
        style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          zIndex: 99999,
          padding: "8px 16px",
          background: "#3D9FE0",
          color: "white",
          border: "none",
          cursor: "pointer",
          fontFamily: "monospace",
          opacity: 0.5,
        }}
      >
        TEST ALIGNMENT UI
      </button>
    </ErrorBoundary>
  );
}
