import type { MessageKey } from "../hooks/useTranslate.js";
import { useTranslate } from "../hooks/useTranslate.js";
import { formatRelativeTime } from "../lib/format.js";
import type { FreshnessThresholds } from "../lib/freshness.js";
import { getFreshnessDotColor } from "../lib/freshness.js";

interface FreshnessIndicatorProps {
  timestamp: string | null | undefined;
  emptyLabelKey?: MessageKey;
  thresholds?: FreshnessThresholds;
}

export function FreshnessIndicator({
  timestamp,
  emptyLabelKey = "freshness.none",
  thresholds,
}: FreshnessIndicatorProps) {
  const t = useTranslate();
  const dotColor = getFreshnessDotColor(timestamp, thresholds);

  if (!timestamp) {
    const label = t(emptyLabelKey);
    return (
      <span className="flex items-center gap-1.5 text-xs" title={label}>
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-muted-foreground">{label}</span>
      </span>
    );
  }

  const time = formatRelativeTime(timestamp);
  return (
    <span className="flex items-center gap-1.5 text-xs" title={t("freshness.lastTime", { time })}>
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      <span className="text-muted-foreground">{time}</span>
    </span>
  );
}
