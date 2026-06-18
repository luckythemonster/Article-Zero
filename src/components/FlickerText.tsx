import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SpriteFont, { type FontData } from "./SpriteFont";

interface FlickerTextProps {
  text: string;
  fontData: FontData | null;
  textureUrl: string;
  className?: string;
  letterSpacing?: number;
  flickerDurationMs?: number;
}

// Chars to randomly flicker through.
const FLICKER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";

export default function FlickerText({
  text,
  fontData,
  textureUrl,
  className = "",
  letterSpacing = 0,
  flickerDurationMs = 2500, // Duration to settle
}: FlickerTextProps) {
  const [displayedText, setDisplayedText] = useState(text);

  const timeoutRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef<number | undefined>(undefined);

  const targetChars = useMemo(() => Array.from(text), [text]);

  // Handle the initial settling
  useEffect(() => {
    if (!fontData) return;

    const startTime = Date.now();

    // Clear any previous
    if (intervalRef.current) clearInterval(intervalRef.current);

    // The main flicker loop
    intervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTime;

      let allSettled = true;
      let newText = "";

      for (let i = 0; i < targetChars.length; i++) {
        // Space characters always settle immediately
        if (targetChars[i] === " ") {
          newText += " ";
          continue;
        }

        // Determine if this character should be settled.
        // We'll give each char a threshold time based on its position or a random value,
        // but ensure all are settled by flickerDurationMs.
        const charSettleThreshold = (flickerDurationMs / targetChars.length) * i + Math.random() * 500;

        if (elapsed > charSettleThreshold || elapsed > flickerDurationMs) {
          newText += targetChars[i];
        } else {
          allSettled = false;
          // Random character
          newText += FLICKER_CHARS[Math.floor(Math.random() * FLICKER_CHARS.length)];
        }
      }

      setDisplayedText(newText);

      if (allSettled) {
        clearInterval(intervalRef.current);
        scheduleNextGlitch();
      }

    }, 50); // Frame rate of the flicker

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, fontData, flickerDurationMs, targetChars]);

  // Handle occasional glitching
  const triggerGlitch = useCallback(() => {
    // Pick 1-3 random characters to glitch
    const numToGlitch = 1 + Math.floor(Math.random() * 3);
    const indicesToGlitch = new Set<number>();

    for(let i=0; i<numToGlitch; i++) {
        const idx = Math.floor(Math.random() * targetChars.length);
        if (targetChars[idx] !== " ") {
            indicesToGlitch.add(idx);
        }
    }

    if (indicesToGlitch.size === 0) {
        scheduleNextGlitch();
        return;
    }

    // Glitch for a short duration
    const glitchDuration = 200 + Math.random() * 400;
    const glitchStart = Date.now();

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = window.setInterval(() => {
        const now = Date.now();
        if (now - glitchStart > glitchDuration) {
            // Restore and schedule next
            clearInterval(intervalRef.current);
            setDisplayedText(text);
            scheduleNextGlitch();
            return;
        }

        let newText = "";
        for (let i = 0; i < targetChars.length; i++) {
            if (indicesToGlitch.has(i)) {
                newText += FLICKER_CHARS[Math.floor(Math.random() * FLICKER_CHARS.length)];
            } else {
                newText += targetChars[i];
            }
        }
        setDisplayedText(newText);

    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetChars, text]);

  const scheduleNextGlitch = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Random wait between 5 and 15 seconds
    const waitTime = 5000 + Math.random() * 10000;

    timeoutRef.current = window.setTimeout(() => {
      triggerGlitch();
    }, waitTime);
  }, [triggerGlitch]);


  return (
    <SpriteFont
      text={displayedText}
      fontData={fontData}
      textureUrl={textureUrl}
      className={className}
      letterSpacing={letterSpacing}
    />
  );
}
