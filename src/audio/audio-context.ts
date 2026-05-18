// Shared AudioContext for every sample-based audio module.
//
// Browsers refuse to start an AudioContext until the user has interacted with
// the page. We lazily create the context on first request and arm a one-time
// `pointerdown` / `keydown` listener that resumes it. Modules call
// `getSharedContext()` whenever they need a context; the unlock fires the
// first time a real user gesture lands and resumes any context already in
// "suspended" state.

let ctx: AudioContext | null = null;
let gestureArmed = false;

function getCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return W.AudioContext ?? W.webkitAudioContext ?? null;
}

function armUnlock(): void {
  if (gestureArmed || typeof window === "undefined") return;
  gestureArmed = true;
  const unlock = (): void => {
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function getSharedContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = getCtor();
  if (!Ctor) return null;
  ctx = new Ctor();
  armUnlock();
  return ctx;
}
