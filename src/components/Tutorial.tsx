// Tutorial — diegetic prompt overlay. Listens for TUTORIAL_PROMPT events and
// shows the most recent one until dismissed. No tooltips. No "press X" stickers.

import { useEffect, useState } from "react";
import { eventBus } from "../engine/EventBus";

interface Prompt {
  promptId: string;
  speaker: string;
  line: string;
}

export default function Tutorial() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    return eventBus.on("TUTORIAL_PROMPT", (p) => setPrompt(p));
  }, []);

  if (!prompt) return null;

  return (
    <div className="az-tutorial" role="status" aria-live="polite">
      <div className="speaker">{prompt.speaker}</div>
      <div>{prompt.line}</div>
      <div style={{ marginTop: 8, textAlign: "right" }}>
        <button
          onClick={() => {
            eventBus.emit("TUTORIAL_DISMISSED", { promptId: prompt.promptId });
            setPrompt(null);
          }}
        >
          ACKNOWLEDGE
        </button>
      </div>
    </div>
  );
}
