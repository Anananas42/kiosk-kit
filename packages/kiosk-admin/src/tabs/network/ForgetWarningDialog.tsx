interface ForgetWarningDialogProps {
  ssid: string;
  onConfirm: (ssid: string) => void;
  onCancel: () => void;
}

export function ForgetWarningDialog({ ssid, onConfirm, onCancel }: ForgetWarningDialogProps) {
  return (
    <div className="network-warning-overlay">
      <div className="network-warning-dialog">
        <p>
          <strong>This is your only connection.</strong> The device will go offline. Plug in
          Ethernet before removing this network.
        </p>
        <div className="form-row">
          <button type="button" className="btn btn-danger btn-sm" onClick={() => onConfirm(ssid)}>
            Forget anyway
          </button>
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
