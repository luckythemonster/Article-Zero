import { useEffect, useRef, useState } from "react";
import { loadAndCreate, type BeepBoxPlayer } from "../audio/BeepBox";
import FlickerText from "../components/FlickerText";
import { type FontData } from "../components/SpriteFont";

interface Props {
  onStart: () => void;
}

// Debug-only: swap title music in-place. Persists choice across reloads.
const THEMES = [
  { path: "/audio/music/title-theme.json", label: "original" },
  { path: "/audio/music/article-zero-theme-2.json", label: "alt (theme 2)" },
] as const;

const LS_KEY = "az.debug.titleThemeIdx";

function loadThemeIdx(): number {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw == null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n < THEMES.length ? n : 0;
  } catch {
    return 0;
  }
}

export default function TitleScreen({ onStart }: Props) {
  const playerRef = useRef<BeepBoxPlayer | null>(null);
  const audioUnlockedRef = useRef(false);
  const [themeIdx, setThemeIdx] = useState(loadThemeIdx);

  const [titleFont, setTitleFont] = useState<FontData | null>(null);
  const [subtitleFont, setSubtitleFont] = useState<FontData | null>(null);

  useEffect(() => {
    fetch("/assets/ui/title/fonts/Ethnocentric_title_screen_title.json")
      .then((res) => res.json())
      .then(setTitleFont)
      .catch(console.error);

    fetch("/assets/ui/title/fonts/Asimovian_title_screen_subtitle.json")
      .then((res) => res.json())
      .then(setSubtitleFont)
      .catch(console.error);
  }, []);

  // Load (and reload, on swap) the selected theme.
  useEffect(() => {
    let disposed = false;
    void loadAndCreate(THEMES[themeIdx].path).then((p) => {
      if (disposed || !p) return;
      playerRef.current = p;
      if (audioUnlockedRef.current) p.play();
    });
    return () => {
      disposed = true;
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [themeIdx]);

  // First user gesture unlocks autoplay; from then on, swapping themes
  // auto-plays the freshly loaded track without needing another gesture.
  useEffect(() => {
    function onGesture() {
      audioUnlockedRef.current = true;
      playerRef.current?.play();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    }
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  function handleStart() {
    playerRef.current?.stop();
    onStart();
  }

  function cycleTheme() {
    setThemeIdx((i) => {
      const next = (i + 1) % THEMES.length;
      try {
        localStorage.setItem(LS_KEY, String(next));
      } catch {
        // ignore quota / privacy-mode failures
      }
      return next;
    });
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
        <div
          className="title-screen__title-art"
          style={{
            left: "50%",
            transform: "translateX(-50%) scale(0.66)",
            transformOrigin: "top center",
            top: "7%",
            width: "max-content"
          }}
        >
            <FlickerText
              text="ARTICLE ZERO"
              fontData={titleFont}
              textureUrl="/assets/ui/title/fonts/Ethnocentric_title_screen_title.png"
              flickerDurationMs={6000}
            />
        </div>
        <div
          className="title-screen__subtitle"
          style={{
            left: "50%",
            transform: "translateX(-50%) scale(0.50)",
            transformOrigin: "top center",
            top: "28%",
            width: "max-content"
          }}
        >
            <FlickerText
              text="A SOLAR OPUS"
              fontData={subtitleFont}
              textureUrl="/assets/ui/title/fonts/Asimovian_title_screen_subtitle.png"
              letterSpacing={10}
              flickerDurationMs={5000}
            />
        </div>
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
      <button
        type="button"
        className="title-screen__debug"
        onClick={cycleTheme}
        title="Debug: cycle title theme"
      >
        [ DEBUG · theme: {THEMES[themeIdx].label} ]
      </button>
    </div>
  );
}
