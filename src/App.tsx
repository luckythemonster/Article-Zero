import TerminalShell from "./shell/TerminalShell";
import ArwesSmokeTest from "./spike/ArwesSmokeTest";

export default function App() {
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("spike") === "arwes"
  ) {
    return <ArwesSmokeTest />;
  }
  return <TerminalShell />;
}
