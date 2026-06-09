import { useEffect, useState } from "react";
import { useDebugStore } from "../state/useDebugStore";

const GLITCH_TEXTURES = [
  "/assets/ui/glitch/chromatic_aberration_teaser.png",
  "/assets/ui/glitch/crt_scanlines_001.png",
  "/assets/ui/glitch/crt_scanlines_002.png",
  "/assets/ui/glitch/crt_scanlines_003.png",
  "/assets/ui/glitch/crt_scanlines_004.png",
  "/assets/ui/glitch/crt_scanlines_005.png",
  "/assets/ui/glitch/data_corruption_teaser.png",
];

export default function GlitchOverlay() {
  const enabled = useDebugStore((s) => s.glitchOverlay);
  const [activeGlitch, setActiveGlitch] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setActiveGlitch(null);
      return;
    }

    let outerTimeoutId: number;
    let innerTimeoutId: number;
    let cancelled = false;

    const scheduleNextGlitch = () => {
      if (cancelled) return;
      // Random wait between 2s and 10s
      const delay = 2000 + Math.random() * 8000;
      outerTimeoutId = window.setTimeout(() => {
        if (cancelled) return;
        // Trigger a glitch
        const texture = GLITCH_TEXTURES[Math.floor(Math.random() * GLITCH_TEXTURES.length)];
        setActiveGlitch(texture);

        // Hide it after a brief moment (50ms - 250ms)
        const duration = 50 + Math.random() * 200;
        innerTimeoutId = window.setTimeout(() => {
          if (cancelled) return;
          setActiveGlitch(null);
          scheduleNextGlitch(); // loop
        }, duration);
      }, delay);
    };

    scheduleNextGlitch();

    return () => {
      cancelled = true;
      window.clearTimeout(outerTimeoutId);
      window.clearTimeout(innerTimeoutId);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="glitch-overlay-container">
      <div
        className="glitch-overlay-scanline"
        style={{ backgroundImage: `url(/assets/ui/glitch/scanlines.gif)` }}
      />
      {activeGlitch && (
        <div
          className="glitch-overlay-texture"
          style={{ backgroundImage: `url(${activeGlitch})` }}
        />
      )}
    </div>
  );
}
