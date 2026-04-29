import { useEffect, useState } from "react";

// True for narrow viewports OR coarse pointers (most touch devices). The
// pointer-coarse check picks up iPads and other tablets that are too wide
// for the 720px width threshold but still need touch controls.

const QUERY = "(max-width: 720px), (pointer: coarse)";

export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const m = window.matchMedia(QUERY);
    const handler = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);
  return isMobile;
}
