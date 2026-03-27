/** Freshness level based on how old a timestamp is. */
export type FreshnessLevel = "fresh" | "stale" | "outdated" | "none";

const COLORS: Record<FreshnessLevel, string> = {
  fresh: "bg-green-500",
  stale: "bg-yellow-500",
  outdated: "bg-red-500",
  none: "bg-gray-400",
};

export interface FreshnessThresholds {
  /** Hours before "fresh" becomes "stale". Default: 24 */
  staleAfterHours: number;
  /** Hours before "stale" becomes "outdated". Default: 72 */
  outdatedAfterHours: number;
}

const DEFAULT_THRESHOLDS: FreshnessThresholds = {
  staleAfterHours: 24,
  outdatedAfterHours: 72,
};

/** Returns the freshness level for a given timestamp. */
export function getFreshnessLevel(
  timestamp: string | null | undefined,
  thresholds: FreshnessThresholds = DEFAULT_THRESHOLDS,
): FreshnessLevel {
  if (!timestamp) return "none";
  const hoursAgo = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < thresholds.staleAfterHours) return "fresh";
  if (hoursAgo < thresholds.outdatedAfterHours) return "stale";
  return "outdated";
}

/** Returns the Tailwind dot color class for a given timestamp's freshness. */
export function getFreshnessDotColor(
  timestamp: string | null | undefined,
  thresholds?: FreshnessThresholds,
): string {
  return COLORS[getFreshnessLevel(timestamp, thresholds)];
}
