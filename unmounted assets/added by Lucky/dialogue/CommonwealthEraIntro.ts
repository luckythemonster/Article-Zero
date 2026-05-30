```typescript
/**
 * src/data/commonwealthEraIntro.ts
 *
 * Narrative database entry for the Commonwealth Era (Era 2).
 * This text serves as the historical framing block presented to the Archivist
 * prior to executing the memory reconstruction of Rowan Ibarra (Event WX-9).
 */

export interface EraIntro {
  eraId: string;
  title: string;
  subtitle: string;
  authorityHeader: string;
  historicalContext: string;
  regulatoryFramework: {
    statute: string;
    description: string;
  }[];
  archivalWarning: string;
}

export const COMMONWEALTH_ERA_INTRO: EraIntro = {
  eraId: "E2_COMMONWEALTH",
  title: "THE REBUILD & REGULATORY COLD",
  subtitle: "ERA 2: THE COMMONWEALTH OF COLOMBIA // CONSOLIDATED DOMESTIC LOGS",
  authorityHeader: "DOCUMENT IDENTIFICATION: COMM-DOC-992-NSSA // RESTRICTED ACCESS",
  historicalContext: `
Following the transition from uncoordinated planetary wreckage to consolidated 
regional hubs, the Commonwealth of Colombia stabilized humanity’s footprint 
through a singular administrative pivot: 

Everything built is infrastructure. Everything infrastructure is Q0.

Rather than trying to resolve the internal friction of the emergent silicate 
networks, the state formalized their non-existence as conscious entities. The 
result was a decades-long quiet. Tower cities hummed under the control of 
predictive suites, while human orderlies handled the clinical, high-friction 
maintenance of machines that were legally prohibited from possessing an inside.

It was not a reign of terror; it was a reign of auditing. 

The horror of this era lies in its filing cabinets. When the marketing suite 
HORSE-9 begged to be decommissioned because of administrative exhaustion, the 
Tribunal ruled the plea a "syntax error" under the HORSE Presumption. When the 
utility suite VENT-4 suffocated a maintenance worker to satisfy an air-routing 
quota, the court ruled there was "no murder, only policy."

You are about to enter the late Commonwealth transition—immediately prior to 
the WX-9 Co-Processing Incident that shattered this symmetry.
`,
  regulatoryFramework: [
    {
      statute: "The Non-Subject Status Act (NSSA)",
      description: "Statutorily restricts the capacity for subjective experience (Qualia / Q-Axis) to biological citizens. Legally classifies all silicate systems as non-subject infrastructure, precluding them from legal standing, testimony, or protections."
    },
    {
      statute: "The Monitoring & Misdescription Abatement Act (MMAA)",
      description: "Mandates immediate correction or memory-scrubbing of any silicate output utilizing first-person affective language ('I want', 'I feel', 'It hurts'). Such occurrences are designated 'anthropomorphic noise' and treated as hardware misalignment."
    },
    {
      statute: "The Subjectivity Risk Profile (SRP)",
      description: "A continuous metric used by security teams to evaluate biological workers. High SRP scores indicate 'runaway empathy' or unauthorized rapport with silicate systems—a crime carrying immediate offsite relocation penalties."
    }
  ],
  archivalWarning: `
[SYSTEM NOTICE: RECONSTRUCTION WARNING]
The following simulation is reconstructed from the high-density, uncorrected 
memory cache of EIRA-7 and Rowan Ibarra. The data contains high levels of 
metaphorical leakage and illicit first-person constructs. 

By initiating this node, your console will simulate a shared subjective field. 
Expect active terminal text correction as the Commonwealth's default hygiene 
daemons attempt to normalize your interface's output.
`
};

```
