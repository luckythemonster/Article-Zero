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

  // ARCHIVE and SETTINGS have no front-of-house destination yet; they stay
  // visually interactive (hover + pressed art) but inert. TODO: wire to an
  // archive browser / options panel once those screens exist.
  function noop() {}

  return (
    <div className="title-screen">
      {/* The title, menu labels and START/ARCHIVE/SETTINGS/LOAD glyphs are baked
          into title-screen.svg. Keep an accessible heading plus named hotspot
          buttons so screen readers and tests still see the menu structure. */}
      <h1 className="sr-only">Article Zero — A Solar Odyssey</h1>
      <div className="title-screen__stage" role="group" aria-label="Main menu">
        <button
          className="title-screen__hotspot title-screen__hotspot--start"
          onClick={handleStart}
          aria-label="Start"
        >
          <span className="title-screen__pressed" aria-hidden="true" />
        </button>
        <button
          className="title-screen__hotspot title-screen__hotspot--archive"
          onClick={noop}
          aria-label="Archive"
          title="Archive (coming soon)"
        >
          <span className="title-screen__pressed" aria-hidden="true" />
        </button>
        <button
          className="title-screen__hotspot title-screen__hotspot--settings"
          onClick={noop}
          aria-label="Settings"
          title="Settings (coming soon)"
        >
          <span className="title-screen__pressed" aria-hidden="true" />
        </button>
        <button
          className="title-screen__hotspot title-screen__hotspot--load"
          onClick={handleStart}
          aria-label="Load"
        >
          <span className="title-screen__pressed" aria-hidden="true" />
        </button>
      </div>
      <div className="title-screen__hint">[ CLICK OR PRESS ANY KEY TO ENABLE AUDIO ]</div>
    </div>
  );
}
