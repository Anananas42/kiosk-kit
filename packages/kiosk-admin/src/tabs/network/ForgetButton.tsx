import { Button } from "@kioskkit/ui";
import { Trash2 } from "lucide-react";

interface ForgetButtonProps {
  ssid: string;
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
}

export function ForgetButton({ ssid, forgettingSsid, onForget }: ForgetButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      aria-label="Forget network"
      loading={forgettingSsid === ssid}
      onClick={(e) => {
        e.stopPropagation();
        onForget(ssid);
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
