// Throwaway. Loaded only when the URL contains `?spike=arwes`.
// Delete this file (and the gate in App.tsx) once the arwes spike decision is made.

import { useState } from "react";
import {
  Animator,
  Text,
  FrameNero,
  BleepsProvider,
  useBleeps,
} from "@arwes/react";

const bleepsSettings = {
  master: { volume: 0.5 },
  bleeps: {
    click: {
      sources: [{ src: "/audio/glitch/ui.click.wav", type: "audio/wav" }],
    },
  },
};

function SmokeBody() {
  const bleeps = useBleeps<"click">();
  const [active, setActive] = useState(true);

  return (
    <Animator active={active} duration={{ enter: 0.6, exit: 0.4 }}>
      <div
        style={{
          position: "relative",
          width: 520,
          height: 240,
          padding: 24,
          color: "#2ec8d4",
          fontFamily: '"Courier New", monospace',
        }}
      >
        <FrameNero />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 18, marginBottom: 12 }}>
            <Text>ARWES SMOKE TEST // EIRA-7</Text>
          </div>
          <div style={{ marginBottom: 16, lineHeight: 1.5 }}>
            <Text>
              If you can read this with a typewriter entrance and see the
              cyan frame around it, arwes is rendering on React 19.
            </Text>
          </div>
          <button
            type="button"
            onClick={() => {
              bleeps.click?.play();
              setActive((a) => !a);
            }}
            style={{
              padding: "8px 16px",
              background: "transparent",
              color: "#2ec8d4",
              border: "1px solid #2ec8d4",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {active ? "DISMISS" : "RE-ENTER"}
          </button>
        </div>
      </div>
    </Animator>
  );
}

export default function ArwesSmokeTest() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050809",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <BleepsProvider {...bleepsSettings}>
        <SmokeBody />
      </BleepsProvider>
    </div>
  );
}
