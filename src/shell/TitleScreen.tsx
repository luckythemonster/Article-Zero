import { useEffect, useRef } from "react";
import { loadAndCreate, type BeepBoxPlayer } from "../audio/BeepBox";

interface Props {
  onStart: () => void;
}

export default function TitleScreen({ onStart }: Props) {
  const playerRef = useRef<BeepBoxPlayer | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    void loadAndCreate("/audio/music/title-theme.json").then((p) => {
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
