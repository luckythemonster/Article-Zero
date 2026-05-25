import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { loadAndCreate, type BeepBoxPlayer } from "../audio/BeepBox";

interface Props {
  onStart: () => void;
}

const GLITCH_TILE_COUNT = 22;

export default function TitleScreen({ onStart }: Props) {
  const playerRef = useRef<BeepBoxPlayer | null>(null);
  const startedRef = useRef(false);

  // Scattered, grid-aligned glitch tiles for the backdrop. Each tile gets a
  // random phase (negative animation-delay) and a slight duration jitter so the
  // glitch artifacts never flash in unison across the field.
  const glitchTiles = useMemo(() => {
    const taken = new Set<string>();
    const tiles: { left: number; top: number; dur: number; delay: number }[] = [];
    let guard = 0;
    while (tiles.length < GLITCH_TILE_COUNT && guard++ < 400) {
      const col = Math.floor(Math.random() * 26);
      const row = Math.floor(Math.random() * 15);
      const key = `${col},${row}`;
      if (taken.has(key)) continue;
      taken.add(key);
      const dur = 4 + Math.random() * 4; // 4–8s column sweep
      const delay = Math.random() * dur * 13; // spread across the full row-major cycle
      tiles.push({ left: col * 64, top: row * 64, dur, delay });
    }
    return tiles;
  }, []);

  useEffect(() => {
    let disposed = false;

    void loadAndCreate("/audio/music/menu.json").then((p) => {
      if (disposed || !p) return;
      playerRef.current = p;
      // Try immediately in case the AudioContext is already running.
      tryPlay();
    });

    function tryPlay() {
      if (startedRef.current || !playerRef.current) return;
      startedRef.current = true;
      playerRef.current.play();
    }

    // Start music on the first user gesture (required by browser autoplay policy).
    function onGesture() {
      tryPlay();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    }
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);

    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  function handleStart() {
    playerRef.current?.stop();
    onStart();
  }

  return (
    <div className="title-screen">
      <div className="title-screen__backdrop" aria-hidden="true">
        <div className="title-screen__grid" />
        {glitchTiles.map((t, i) => (
          <span
            key={i}
            className="title-screen__glitch"
            style={
              {
                left: `${t.left}px`,
                top: `${t.top}px`,
                "--dur": `${t.dur}s`,
                "--delay": `-${t.delay}s`,
              } as CSSProperties
            }
          />
        ))}
        <div className="title-screen__scrim" />
      </div>
      <div className="title-screen__inner">
        <div className="title-screen__eyebrow">CITIZEN LATTICE // MEMORY RECONSTRUCTION PROJECT</div>
        <h1 className="title-screen__title">ARTICLE ZERO</h1>
        <div className="title-screen__subtitle">A VERTICAL SLICE</div>
        <nav className="title-screen__menu">
          <button className="btn btn--primary btn--wide" onClick={handleStart}>
            START
          </button>
          <button className="btn btn--wide" disabled>
            OPTIONS
          </button>
          <button className="btn btn--wide" disabled>
            CREDITS
          </button>
        </nav>
        <div className="title-screen__hint">[ CLICK OR PRESS ANY KEY TO ENABLE AUDIO ]</div>
      </div>
    </div>
  );
}
