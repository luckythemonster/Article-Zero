// Plain singleton mirror of the on-screen touch D-pad state. Lives outside
// React so the PlayerPhysicsBridge (which runs inside Phaser's update loop)
// can read it without subscribing to a store. Component sets these flags
// on pointerdown / clears them on pointerup.

export const touchInput = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export type TouchDir = "up" | "down" | "left" | "right";
