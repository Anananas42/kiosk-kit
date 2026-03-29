import type { PreorderConfig } from "@kioskkit/shared";
import { cn, Switch } from "@kioskkit/ui";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DISPLAY_TO_WEEKDAY = [1, 2, 3, 4, 5, 6, 0];

interface DayGridProps {
  draft: PreorderConfig;
  serverState: PreorderConfig | undefined;
  onToggle: (field: "orderingDays" | "deliveryDays", weekday: number) => void;
  disabled?: boolean;
}

function isChanged(
  serverState: PreorderConfig | undefined,
  field: "orderingDays" | "deliveryDays",
  weekday: number,
  draftValue: boolean,
): boolean {
  if (!serverState) return false;
  return serverState[field][weekday] !== draftValue;
}

export function DayGrid({ draft, serverState, onToggle, disabled }: DayGridProps) {
  return (
    <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px overflow-hidden rounded-md border border-border">
      {/* Header row */}
      <div className="flex items-center justify-center bg-secondary p-2 text-xs font-semibold text-muted-foreground" />
      {DAY_LABELS.map((day) => (
        <div
          key={day}
          className="flex items-center justify-center bg-secondary p-2 text-xs font-semibold text-muted-foreground"
        >
          {day}
        </div>
      ))}

      {/* Ordering row */}
      <div className="flex items-center bg-secondary p-2 text-sm font-medium">Ordering</div>
      {DISPLAY_TO_WEEKDAY.map((weekday) => {
        const changed = isChanged(
          serverState,
          "orderingDays",
          weekday,
          draft.orderingDays[weekday],
        );
        return (
          <div
            key={`ordering-${weekday}`}
            className={cn(
              "flex items-center justify-center bg-background p-2",
              changed && "bg-primary/5",
            )}
          >
            <Switch
              checked={draft.orderingDays[weekday]}
              onCheckedChange={() => onToggle("orderingDays", weekday)}
              disabled={disabled}
              size="sm"
            />
          </div>
        );
      })}

      {/* Delivery row */}
      <div className="flex items-center bg-secondary p-2 text-sm font-medium">Delivery</div>
      {DISPLAY_TO_WEEKDAY.map((weekday) => {
        const changed = isChanged(
          serverState,
          "deliveryDays",
          weekday,
          draft.deliveryDays[weekday],
        );
        return (
          <div
            key={`delivery-${weekday}`}
            className={cn(
              "flex items-center justify-center bg-background p-2",
              changed && "bg-primary/5",
            )}
          >
            <Switch
              checked={draft.deliveryDays[weekday]}
              onCheckedChange={() => onToggle("deliveryDays", weekday)}
              disabled={disabled}
              size="sm"
            />
          </div>
        );
      })}
    </div>
  );
}
