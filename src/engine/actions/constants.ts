export const MOVE_AP_COST = 1;
export const SNEAK_AP_COST = 1;
export const RUN_AP_COST = 1;
export const KNOCK_AP_COST = 1;
export const INTERACT_AP_COST = 1;
export const VENT_AP_COST = 2;
export const LADDER_AP_COST = 1;
export const KILL_SCREEN_AP_COST = 1;
export const PRY_LOCKDOWN_AP_COST = 2;
export const ALIGN_AP_COST = 3;

export const WALK_INTENSITY = 1;
export const SNEAK_INTENSITY = 0;
// Sits between WALK (1, CAUTION threshold) and KNOCK (4, ALERT threshold) so a
// run pulls patrols to CAUTION on the first heard step but doesn't immediately
// scream "intruder". See AlertFSM thresholds.
export const RUN_INTENSITY = 2;
export const KNOCK_INTENSITY = 4;
export const DOOR_INTENSITY = 2;
export const LOCKER_INTENSITY = 2;
export const LADDER_INTENSITY = 1;
export const PRY_LOCKDOWN_INTENSITY = 6;
