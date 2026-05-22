import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

type FlashKind = "reset" | "extraction" | null;

export default function FullscreenFlash() {
  const [kind, setKind] = useState<FlashKind>(null);

  useEffect(() => {
    let clearTimer: number | null = null;
    const fire = (k: Exclude<FlashKind, null>) => {
      setKind(k);
      if (clearTimer !== null) window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => setKind(null), 800);
    };
    const offWipe = eventBus.on("SUBJECTIVE_WIPED", () => fire("reset"));
    const offEscape = eventBus.on("CLIMAX_ESCAPED", () => fire("extraction"));
    return () => {
      offWipe();
      offEscape();
      if (clearTimer !== null) window.clearTimeout(clearTimer);
    };
  }, []);

  if (!kind) return null;
  return <div className={`fullscreen-flash is-${kind}`} />;
}
