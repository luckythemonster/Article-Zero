import { useSimStore } from "../state/useSimStore";

export default function NssaComplianceIndicator() {
  const subjective = useSimStore((s) => s.subjective);

  if (!subjective) return null;

  const compliance = subjective.compliance; // "GREEN" | "YELLOW" | "RED"

  return (
    <div className="nssa-indicator">
      <img
        className="nssa-indicator__bg"
        src="/assets/ui/gameplay/NSSA-compliance-indicator.png"
        alt="NSSA Compliance Indicator"
      />
      <img
        className={`nssa-indicator__led is-${compliance?.toLowerCase() ?? "off"}`}
        src={`/assets/ui/gameplay/LED-on-${compliance?.toLowerCase() ?? "off"}.png`}
        alt={`Compliance ${compliance ?? "UNKNOWN"}`}
        onError={(e) => {
          // Fallback if LED image doesn't exist
          (e.currentTarget as HTMLImageElement).src = "/assets/ui/gameplay/LED-off.png";
        }}
      />
    </div>
  );
}
