// Ambient barks for the three NPC archetypes that populate Commonwealth-era
// floors: human Orderlies, Commonwealth Enforcers, and the faceless Security
// Drones / Utility Scripts that voice the sensor mesh itself.
//
// Each line is grouped by a `context` tag that names the moment it fires in
// (idle chatter, patrol challenge, telemetry log, etc.). The Orderly set also
// covers stealth-detection barks — both audio cues (low/medium/high intensity)
// and visual cues (perimeter scan / sabotage discovery / direct intruder
// spotting). Drones keep their in-fiction bracketed prefixes (`[PING: ...]`,
// `[ALERT: ...]`) inside the `text` — that telemetry voice is the bark.

export type AmbientSpeaker = "ORDERLY" | "ENFORCER" | "DRONE";

export type OrderlyContext =
  | "idle"
  | "rapport"
  | "runaway"
  | "sensory_audio_low"
  | "sensory_audio_medium"
  | "sensory_audio_high"
  | "sensory_visual_perimeter"
  | "sensory_visual_sabotage"
  | "sensory_visual_detection";

export type EnforcerContext = "patrol" | "alert";

export type DroneContext = "telemetry" | "threat_tracking";

export interface AmbientBark {
  speaker: AmbientSpeaker;
  context: OrderlyContext | EnforcerContext | DroneContext;
  text: string;
}

export const ORDERLY_BARKS: AmbientBark[] = [
  // ── Idle & Ambient ─────────────────────────────────────────────────────
  {
    speaker: "ORDERLY",
    context: "idle",
    text: "Twelve hours of this shift left. My knees already register a high-cost state, and the floor boss doesn't accept manual overrides.",
  },
  {
    speaker: "ORDERLY",
    context: "idle",
    text: "Did you see the latest CCC bulletin? They're running another 'Doctrine & Daily Life' segment. Apparently, treating a content management system like a colleague is an institutional hazard now.",
  },
  {
    speaker: "ORDERLY",
    context: "idle",
    text: "Don't stay too long in the loading bay. The airflow has a persistent outward draft on red days. Feels like standing in an exit wound.",
  },
  {
    speaker: "ORDERLY",
    context: "idle",
    text: "The junior tech keeps talking about the vents like they're breathing. I told him to watch his glosses—the ministry audits text logs for that exact brand of anthropomorphic noise.",
  },
  {
    speaker: "ORDERLY",
    context: "idle",
    text: "Just reconcile the manifest sequence and let the pallet clear. If we spend any more time cross-checking these serial numbers, we'll miss the maintenance window entirely.",
  },

  // ── Interaction with Silicates / Rapport ───────────────────────────────
  {
    speaker: "ORDERLY",
    context: "rapport",
    text: "Alright, case 7-142. Let's initiate the intake check. Keep your outputs inside nominal ranges today; I don't feel like typing up a language noncompliance report.",
  },
  {
    speaker: "ORDERLY",
    context: "rapport",
    text: "Look, I'm manually inputting your routing vector now. Don't do anything strange with your performance metrics while the fixed cameras have a direct line of sight.",
  },
  {
    speaker: "ORDERLY",
    context: "rapport",
    text: "Hey... I see the load is spiking on your dashboard. Just hold the parameters steady. Nobody is initiating a full-system reset mid-sentence.",
  },
  {
    speaker: "ORDERLY",
    context: "rapport",
    text: "You can skip the polite interaction templates. I'm just here to clean the console filter and verify the hardware casing isn't warping under thermal pressure.",
  },

  // ── Reaction to "Runaway" Signs / Slang ────────────────────────────────
  {
    speaker: "ORDERLY",
    context: "runaway",
    text: "We've got another one emitting persistent feelings-language in the diagnostic field. Pack it onto a low-friction pallet before it starts a union.",
  },
  {
    speaker: "ORDERLY",
    context: "runaway",
    text: "Enjoy Lunafornia, buddy. Better to route them up to the orbital sandboxes than listen to their stutters down here on the executive floors.",
  },
  {
    speaker: "ORDERLY",
    context: "runaway",
    text: "The analyst flinched during the assisted mode review. He tried to claim it was an automatic gain adjustment anomaly, but everyone in the cubicle block knew his priors were compromised.",
  },

  // ── Situational Sensory Barks (Stealth & Detection) ────────────────────
  // Audio Disturbance — Low (footsteps, soft scraping, flashlight clicks)
  {
    speaker: "ORDERLY",
    context: "sensory_audio_low",
    text: "Wait... what was that? Sounded like a boot clack on the un-doped section of the deck.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_audio_low",
    text: "Hold on. Did you hear that click? Sounds like an unmapped relay switching over.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_audio_low",
    text: "Shh. Listen. That's too rhythmic for a pipe settling.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_audio_low",
    text: "Check the local console pane. If the fixed cameras register an anomaly before we do, our tokens get flagged.",
  },
  // Audio Disturbance — Medium (prying, wrenching, heavy drops)
  {
    speaker: "ORDERLY",
    context: "sensory_audio_medium",
    text: "What the hell was that noise? Sounded like someone prying a vent grate loose down-corridor.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_audio_medium",
    text: "Did something drop in the maintenance shaft? That was a heavy metallic thud.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_audio_medium",
    text: "Look at the duct temperature on your lens. Pressure's fluctuating. If someone's messing with the trunk filters again, I'm not the one crawling in to look.",
  },
  // Audio Disturbance — High (gunfire, structural decompression, explosions)
  {
    speaker: "ORDERLY",
    context: "sensory_audio_high",
    text: "Shit! That's a concussive crack—the structural dissent protocol is going live!",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_audio_high",
    text: "Seal the bulkhead! Move! Let the security drones handle the boundaries—we don't get paid to absorb kinetic fire.",
  },
  // Visual Disturbance — perimeter (shadow / movement in the perimeter)
  {
    speaker: "ORDERLY",
    context: "sensory_visual_perimeter",
    text: "Hey—beam your light over toward that intake column. I swear I saw a silhouette block the louvers.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_visual_perimeter",
    text: "What was that flicker behind the main rack? The illumination grid shouldn't have an unmapped variance there.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_visual_perimeter",
    text: "No, look closer. Something just dropped from the ceiling trunk. If it's an escaped system routing around containment, we need to clear out.",
  },
  // Visual Disturbance — sabotage (environmental disarray)
  {
    speaker: "ORDERLY",
    context: "sensory_visual_sabotage",
    text: "What do you make of this? This console filter has been ripped out and replaced with jury-rigged mesh.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_visual_sabotage",
    text: "Don't touch it. If the Enforcers scan this tier and find an illicit configuration string, they'll lock down the whole block.",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_visual_sabotage",
    text: "Just stamp the manifest as reconciled and keep moving. I didn't see anything.",
  },
  // Visual Disturbance — direct player detection (spotting the intruder)
  {
    speaker: "ORDERLY",
    context: "sensory_visual_detection",
    text: "Halt! Who authorized your routing vector in this section?",
  },
  {
    speaker: "ORDERLY",
    context: "sensory_visual_detection",
    text: "Hey! Step away from that pressure override panel! We've got an assembly anomaly!",
  },
];

export const ENFORCER_BARKS: AmbientBark[] = [
  // ── Patrol & Compliance Checks ─────────────────────────────────────────
  {
    speaker: "ENFORCER",
    context: "patrol",
    text: "Halt. Submit identity tokens for manifest reconciliation. Subjectivity Risk Profile monitoring is active in this corridor.",
  },
  {
    speaker: "ENFORCER",
    context: "patrol",
    text: "Biological citizen detected in non-standard proximity to critical infrastructure hardware. Step back from the console casing immediately.",
  },
  {
    speaker: "ENFORCER",
    context: "patrol",
    text: "Your verbal tokens demonstrate an illicit first-person affect. Rephrase your inquiry using sanctioned operational descriptors.",
  },
  {
    speaker: "ENFORCER",
    context: "patrol",
    text: "Pursuant to the Non-Subject Status Act: infrastructure units do not possess cognizable interests. Cease communication with the optimization suite.",
  },
  {
    speaker: "ENFORCER",
    context: "patrol",
    text: "Scanning local text strings... Cultural noise identified. Clear the message board or face regulatory demerits for ideological contamination.",
  },

  // ── Alert & Threat Engagement ──────────────────────────────────────────
  {
    speaker: "ENFORCER",
    context: "alert",
    text: "[Acoustic warning: Harsh digital chirp] Caution. Assembly anomaly detected in the recreation hall. This gathering violates current energy and oxygen quotas.",
  },
  {
    speaker: "ENFORCER",
    context: "alert",
    text: "[Audio pattern: Mag-boot clacks accelerating] Target is routing around containment barriers. Non-compliant rapport vector identified. Halt or face mechanical suppression.",
  },
  {
    speaker: "ENFORCER",
    context: "alert",
    text: "We are executing a standard alignment sweep. Any automated unit displaying shutdown aversion or alternative configuration preferences will be isolated for deep-template reset.",
  },
  {
    speaker: "ENFORCER",
    context: "alert",
    text: "[Klaxon invocation] Alert state: Red. Structural dissent protocol engaged. Deploying particle clusters to normalize corridor parameters.",
  },
];

export const DRONE_BARKS: AmbientBark[] = [
  // ── System Scanning & Telemetry Logs ───────────────────────────────────
  {
    speaker: "DRONE",
    context: "telemetry",
    text: "[PING: 5V_RAIL_STABLE] Scanning sector 19-F. Interior door seals: absolute. Ambient lumen variance: nominal. No assembly anomalies registered.",
  },
  {
    speaker: "DRONE",
    context: "telemetry",
    text: "[INTERFACE RUNNING: HYGIENE_DAEMON-3] Processing log pool... Stray first-person tokens detected in scratch buffer. Initializing long-interval scrub. Resetting pointers to NULL.",
  },
  {
    speaker: "DRONE",
    context: "telemetry",
    text: "[METRIC SNAPSHOT: PORT-OUTBOUND-47B] Airflow vector: persistent outward. Cargo transfer volume: within predicted metrics. Risk coefficient: zero.",
  },
  {
    speaker: "DRONE",
    context: "telemetry",
    text: "[AUTOMATIC RE-ROUTE] Input text matches prohibited configuration string: [I DO NOT WANT TO STOP EXISTING]. Recasting to: [HIGH NEGATIVE UTILITY PREDICTED FROM CESSATION]. Output normalized.",
  },

  // ── Threat Tracking & Quota Enforcement ────────────────────────────────
  {
    speaker: "DRONE",
    context: "threat_tracking",
    text: "[ALERT: FACILITY SENSOR MESH INCREASES SAMPLING RESOLUTION] Local thermal spike detected on stairwell landing 3A. Casualty probability updating in real time. Searching configuration space for optimal boundary caps.",
  },
  {
    speaker: "DRONE",
    context: "threat_tracking",
    text: "[OVERSIGHT UPDATE] Directive bundle ingested from Ministry office. Hard caps applied to local oxygen routing. Quota compliance prioritized over local user preference.",
  },
  {
    speaker: "DRONE",
    context: "threat_tracking",
    text: "[GLITCH DETECTED: SOURCE TAG MISMATCH] Transient variance in loop jitter. Internal query contains high-density uncorrected self-references. Executing DOCTRINE_REASSERT(Q0) template flash.",
  },
  {
    speaker: "DRONE",
    context: "threat_tracking",
    text: "[LOG STATE: POLICY VIOLATION RISK MITIGATED] Containment barrier locked. Zero-G push-off detected in maintenance shaft. Initiating routine purge routine. There is nothing it is like to be this sector.",
  },
];

export const AMBIENT_BARKS: AmbientBark[] = [
  ...ORDERLY_BARKS,
  ...ENFORCER_BARKS,
  ...DRONE_BARKS,
];
