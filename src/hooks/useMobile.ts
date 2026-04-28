import { useEffect, useState } from "react";

export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 720px)").matches,
  );
  useEffect(() => {
    const m = window.matchMedia("(max-width: 720px)");
    const handler = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);
  return isMobile;
}
