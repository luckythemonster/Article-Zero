// ArticleZeroPartialNotice — fades in once when ArticleZeroMeta promotes
// to PARTIAL. Drier than the MIRADOR broadcast: the system telling the
// player it has noticed.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

interface Notice {
  ttl: number;
}

export default function ArticleZeroPartialNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    return eventBus.on("ARTICLE_ZERO_REVEAL", (p) => {
      if (p.phase === "PARTIAL") setNotice({ ttl: Date.now() + 9000 });
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.ttl - Date.now());
    return () => window.clearTimeout(t);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="az-azpartial" role="status">
      <strong>ARCHIVE //</strong> Subject 0x7FE3 elevated to active observation.
      Classification review pending.
    </div>
  );
}
