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

let ctx: AudioContext | null = null;
let unlocked = false;

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
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function unlock(): void {
  if (unlocked) return;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  // iOS wake-up: a 1-frame silent buffer played inside the gesture handler.
  try {
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch {
    // No-op — if the create/start path throws we're no worse off than before.
  }
  unlocked = true;
  // Tear down all the gesture listeners now that we're unlocked.
  for (const name of GESTURES) window.removeEventListener(name, unlock);
}

const GESTURES = ["pointerdown", "touchstart", "touchend", "mousedown", "keydown", "click"] as const;

if (typeof window !== "undefined") {
  for (const name of GESTURES) {
    window.addEventListener(name, unlock, { passive: true });
  }
}

export function getSharedContext(): AudioContext | null {
  return ensureCtx();
}

export function isAudioUnlocked(): boolean {
  return unlocked && ctx !== null && ctx.state === "running";
}
