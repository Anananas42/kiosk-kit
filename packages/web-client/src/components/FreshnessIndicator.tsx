import { formatRelativeTime } from "../lib/format.js";
import type { FreshnessThresholds } from "../lib/freshness.js";
import { getFreshnessDotColor } from "../lib/freshness.js";

interface FreshnessIndicatorProps {
  timestamp: string | null | undefined;
  emptyLabel?: string;
  thresholds?: FreshnessThresholds;
}

export function FreshnessIndicator({
  timestamp,
  emptyLabel = "None",
  thresholds,
}: FreshnessIndicatorProps) {
  const dotColor = getFreshnessDotColor(timestamp, thresholds);

  if (!timestamp) {
    return (
      <span className="flex items-center gap-1.5 text-xs" title={emptyLabel}>
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-muted-foreground">{emptyLabel}</span>
      </span>
    );
  }

  const label = formatRelativeTime(timestamp);
  return (
    <span className="flex items-center gap-1.5 text-xs" title={`Last: ${label}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
