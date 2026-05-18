// Shared AudioContext for every sample-based audio module.
//
// iOS Safari rule: the AudioContext must be both created AND resumed inside
// the synchronous portion of a user gesture handler. We satisfy that by
// arming gesture listeners at module load — well before any audio module
// asks for a context — and doing the create + resume + silent-buffer "wake"
// dance in there. Subsequent `getSharedContext()` calls just return the
// already-running context.
//
// The silent 1-frame buffer is the standard iOS unblock trick: simply
// resuming the context isn't always enough to make iOS treat the page as
// audio-playing.
//
// `getUnlockStats()` exposes diagnostic counters so the AUDIO debug panel
// can prove whether window-level gestures are actually reaching this
// module — on some iPad input layers (on-screen overlay keyboards) the
// events may not bubble.

const GESTURES = [
  "pointerdown",
  "touchstart",
  "touchend",
  "mousedown",
  "keydown",
  "click",
] as const;

let ctx: AudioContext | null = null;
let unlocked = false;
let gestures = 0;
let lastGesture = "";
let lastError: string | null = null;

function getCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return W.AudioContext ?? W.webkitAudioContext ?? null;
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = getCtor();
  if (!Ctor) {
    lastError = "no AudioContext constructor";
    return null;
  }
  try {
    ctx = new Ctor();
  } catch (err) {
    lastError = `ctx create: ${err instanceof Error ? err.message : String(err)}`;
    return null;
  }
  return ctx;
}

function unlock(): void {
  if (unlocked) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") {
    try {
      void c.resume();
    } catch (err) {
      lastError = `resume: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  // iOS wake-up: a 1-frame silent buffer played inside the gesture handler.
  try {
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch (err) {
    lastError = `silent buf: ${err instanceof Error ? err.message : String(err)}`;
  }
  unlocked = true;
  for (const name of GESTURES) window.removeEventListener(name, handlers[name]);
}

function makeHandler(name: string): EventListener {
  return () => {
    gestures++;
    lastGesture = name;
    if (!unlocked) unlock();
  };
}

const handlers: Record<string, EventListener> = {};

if (typeof window !== "undefined") {
  for (const name of GESTURES) {
    handlers[name] = makeHandler(name);
    window.addEventListener(name, handlers[name], { passive: true });
  }
}

export function getSharedContext(): AudioContext | null {
  return ensureCtx();
}

export function isAudioUnlocked(): boolean {
  return unlocked && ctx !== null && ctx.state === "running";
}

export function getUnlockStats(): {
  gestures: number;
  lastGesture: string;
  unlocked: boolean;
  ctxState: string;
  lastError: string | null;
} {
  return {
    gestures,
    lastGesture,
    unlocked,
    ctxState: ctx ? ctx.state : "uncreated",
    lastError,
  };
}
