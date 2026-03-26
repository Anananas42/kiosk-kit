import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kioskkit/ui";

interface ForgetWarningDialogProps {
  ssid: string;
  onConfirm: (ssid: string) => void;
  onCancel: () => void;
}

export function ForgetWarningDialog({ ssid, onConfirm, onCancel }: ForgetWarningDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Warning</DialogTitle>
          <DialogDescription>
            <strong>This is your only connection.</strong> The device will go offline. Plug in
            Ethernet before removing this network.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onConfirm(ssid)}>
            Forget anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
