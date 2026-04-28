// MiradorBroadcast — surfaces MIRADOR persona broadcasts as a fading top-left
// notice. Doctrine-coloured: compliant in blue-grey, dispute-related in red.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

interface Notice {
  line: string;
  ttl: number;
}

export default function MiradorBroadcast() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const off = eventBus.on("MIRADOR_BROADCAST", (p) => {
      setNotice({ line: p.line, ttl: Date.now() + 7000 });
    });
    return off;
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.ttl - Date.now());
    return () => window.clearTimeout(t);
  }, [notice]);

  if (!notice) return null;
  return (
    <div className="az-broadcast" role="status">
      <strong>MIRADOR //</strong> {notice.line}
    </div>
  );
}
