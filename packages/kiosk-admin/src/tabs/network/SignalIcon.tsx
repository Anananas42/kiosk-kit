import { WifiOff } from "lucide-react";

function signalBars(dBm: number): number {
  if (dBm > -50) return 4;
  if (dBm > -60) return 3;
  if (dBm > -70) return 2;
  return 1;
}

const BAR_HEIGHTS = ["h-1", "h-[7px]", "h-2.5", "h-3.5"];

export function SignalIcon({ dBm, offline }: { dBm: number; offline?: boolean }) {
  if (offline) {
    return <WifiOff className="h-4 w-4 text-muted-foreground" />;
  }

  const bars = signalBars(dBm);
  return (
    <span className="inline-flex items-end gap-px h-3.5" title={`${dBm} dBm`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`inline-block w-[3px] rounded-[1px] ${BAR_HEIGHTS[i - 1]} ${
            i <= bars ? "bg-primary" : "bg-border"
          }`}
        />
      ))}
    </span>
  );
}
