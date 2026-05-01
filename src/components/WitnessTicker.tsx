// WitnessTicker — surfaces post-RUN-01 ambient witness events as a fading
// notice in the top-left, opposite the MiradorBroadcast position. The full
// stream is still reviewable in the Document Archive.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

interface Notice {
  line: string;
  ttl: number;
}

export default function WitnessTicker() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    return eventBus.on("WITNESS_EVENT", (p) => {
      setNotice({ line: p.line, ttl: Date.now() + 6000 });
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.ttl - Date.now());
    return () => window.clearTimeout(t);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="az-witness" role="status">
      <strong>WITNESS //</strong> {notice.line}
    </div>
  );
}
