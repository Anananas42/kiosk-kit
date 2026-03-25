import { type FormEvent, useState } from "react";
import { trpc } from "../../trpc.js";

interface HiddenNetworkFormProps {
  onConnected: () => void;
  onError: (msg: string) => void;
  onClearError: () => void;
}

export function HiddenNetworkForm({ onConnected, onError, onClearError }: HiddenNetworkFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  const reset = () => {
    setShowForm(false);
    setSsid("");
    setPassword("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) return;
    setConnecting(true);
    onClearError();
    trpc["admin.network.connect"]
      .mutate({ ssid: ssid.trim(), password: password || undefined })
      .then(() => {
        reset();
        onConnected();
      })
      .catch(() => onError("Could not connect — check password and try again"))
      .finally(() => setConnecting(false));
  };

  if (!showForm) {
    return (
      <div className="network-hidden-section">
        <button type="button" className="btn btn-sm" onClick={() => setShowForm(true)}>
          Connect to hidden network
        </button>
      </div>
    );
  }

  return (
    <div className="network-hidden-section">
      <form className="network-expand" onSubmit={handleSubmit}>
        <h3 className="section-heading">Hidden Network</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="Network name (SSID)"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            disabled={connecting}
          />
          <input
            type="password"
            placeholder="Password (optional)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={connecting}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={connecting || !ssid.trim()}
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
          <button type="button" className="btn btn-sm" onClick={reset}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
