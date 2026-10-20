import { confidenceColor } from "@/lib/ui/labels";

/** Small ring showing an answer's confidence; a tick once approved. */
export function ConfidenceRing({
  confidence,
  approved = false,
  threshold = 0.8,
  size = 26,
}: {
  confidence: number;
  approved?: boolean;
  threshold?: number;
  size?: number;
}) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const label = approved
    ? "approved"
    : `confidence ${confidence.toFixed(2)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      {approved ? (
        <>
          <circle cx="13" cy="13" r={r} fill="none" stroke="var(--teal)" strokeWidth="3" />
          <path d="M8.5 13.2l3 3 6-6.4" fill="none" stroke="var(--teal)" strokeWidth="2.2" />
        </>
      ) : (
        <>
          <circle cx="13" cy="13" r={r} fill="none" stroke="var(--track)" strokeWidth="3" />
          <circle
            cx="13"
            cy="13"
            r={r}
            fill="none"
            stroke={confidenceColor(confidence, threshold)}
            strokeWidth="3"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(1, confidence)))}
            strokeLinecap="round"
            transform="rotate(-90 13 13)"
          />
        </>
      )}
    </svg>
  );
}
