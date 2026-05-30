import ErrorBoundary from "./components/ErrorBoundary";
import TerminalShell from "./shell/TerminalShell";
import ArwesSmokeTest from "./spike/ArwesSmokeTest";

export default function App() {
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
      <TerminalShell />
    </ErrorBoundary>
  );
}
