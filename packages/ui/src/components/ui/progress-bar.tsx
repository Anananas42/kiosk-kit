import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0–100 */
  progress: number;
  /** e.g. "45% — 12.3 MB / 27.1 MB" */
  detail?: string;
  className?: string;
}

function ProgressBar({ progress, detail, className }: ProgressBarProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
        />
      </div>
      {detail && <p className="text-muted-foreground text-xs">{detail}</p>}
    </div>
  );
}

export type { ProgressBarProps };
export { ProgressBar };
