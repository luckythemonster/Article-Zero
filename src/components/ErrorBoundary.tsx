// ErrorBoundary — catches render-time errors thrown anywhere in the React UI
// tree (the terminal shell + overlays) and shows a graceful fallback instead of
// unmounting the whole app to a blank screen mid-turn.
//
// Scope note: React error boundaries only catch errors thrown during React
// rendering/lifecycle. The Phaser canvas is driven imperatively (see
// PhaserCanvas), so a thrown overlay error trips this boundary without touching
// the running game — the canvas keeps its last frame behind the fallback.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure to the console for debugging; we intentionally don't
    // report anywhere else (no telemetry in this build).
    console.error("[ErrorBoundary] UI render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          background: "var(--bg, #050809)",
          color: "var(--accent-bad, #e2614a)",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          zIndex: 9999,
        }}
      >
        <div style={{ fontSize: "1.1rem", letterSpacing: "0.15em" }}>
          TERMINAL ERROR
        </div>
        <div style={{ color: "var(--ink-dim, #6b7a72)", fontSize: "0.85rem" }}>
          The archive interface faulted. Refresh to continue.
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
