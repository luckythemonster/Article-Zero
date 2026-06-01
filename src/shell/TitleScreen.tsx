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

    void loadAndCreate("/audio/music/article-zero-theme-2.json").then((p) => {
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

  // ARCHIVE has no destination yet; it stays visually interactive (hover +
  // pressed art) but inert. LOAD currently re-uses handleStart as a
  // placeholder until a save-slot picker exists.
  function noop() {}

  return (
    <div className="title-screen">
      <h1 className="sr-only">Article Zero — A Solar Opus</h1>
      <div className="title-screen__stage" role="group" aria-label="Main menu">
        <img
          className="title-screen__bg"
          src="/assets/ui/title/background.png"
          alt=""
          aria-hidden="true"
        />
        <img
          className="title-screen__title-art"
          src="/assets/ui/title/title.png"
          alt=""
          aria-hidden="true"
        />
        <img
          className="title-screen__subtitle"
          src="/assets/ui/title/subtitle.png"
          alt=""
          aria-hidden="true"
        />
        <button
          className="title-screen__btn title-screen__btn--start"
          onClick={handleStart}
          aria-label="Start"
        />
        <button
          className="title-screen__btn title-screen__btn--load"
          onClick={handleStart}
          aria-label="Load"
        />
        <button
          className="title-screen__btn title-screen__btn--archive"
          onClick={noop}
          aria-label="Archive"
          title="Archive (coming soon)"
        />
      </div>
      <div className="title-screen__hint">[ CLICK OR PRESS ANY KEY TO ENABLE AUDIO ]</div>
    </div>
  );
}
