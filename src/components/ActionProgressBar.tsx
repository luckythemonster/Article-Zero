// ActionProgressBar — surfaces the player's current ActionLock as a bar.
//
// Subscribes to ACTION_LOCK_STARTED / ACTION_PROGRESS / ACTION_LOCK_RELEASED
// on the EventBus (the only bridge between Phaser-side state and React).
// While a lock is active, renders a fixed-position bar near the bottom of
// the game canvas so the player sees a clear, mathematically readable
// commitment timer for terminal-use, vent-crawl, etc.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

interface ActiveLock {
  actionId: string;
  progress: number;
  duration: number;
}

const LABELS: Record<string, string> = {
  TERMINAL_USE: "READING TERMINAL",
  VENT_CRAWL: "CRAWLING VENT",
};

export default function ActionProgressBar() {
  const [lock, setLock] = useState<ActiveLock | null>(null);

  useEffect(() => {
    const offStart = eventBus.on("ACTION_LOCK_STARTED", (p) => {
      setLock({ actionId: p.actionId, progress: 0, duration: p.duration });
    });
    const offProgress = eventBus.on("ACTION_PROGRESS", (p) => {
      setLock({
        actionId: p.actionId,
        progress: p.progress,
        duration: p.duration,
      });
    });
    const offRelease = eventBus.on("ACTION_LOCK_RELEASED", () => {
      setLock(null);
    });
    return () => {
      offStart();
      offProgress();
      offRelease();
    };
  }, []);

  if (!lock) return null;

  const label = LABELS[lock.actionId] ?? lock.actionId;
  const pct = Math.min(100, Math.max(0, lock.progress * 100));

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "16%",
        transform: "translateX(-50%)",
        width: "240px",
        padding: "8px 12px",
        background: "rgba(5,8,9,0.85)",
        border: "1px solid #2a3138",
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#9bb1b6",
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 18,
      }}
    >
      <div style={{ marginBottom: "4px", letterSpacing: "1px" }}>{label}</div>
      <div
        style={{
          height: "6px",
          background: "#0f1518",
          border: "1px solid #2a3138",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "#6ad0a4",
            transition: "width 80ms linear",
          }}
        />
      </div>
    </div>
  );
}
