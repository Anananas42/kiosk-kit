import { Button, Input } from "@kioskkit/ui";
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
      <div className="mt-6">
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          Connect to hidden network
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <form className="rounded-md bg-secondary p-4" onSubmit={handleSubmit}>
        <h3 className="mb-4 text-sm font-semibold">Hidden Network</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            placeholder="Network name (SSID)"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            disabled={connecting}
            className="w-auto min-w-[200px]"
          />
          <Input
            type="password"
            placeholder="Password (optional)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={connecting}
            className="w-auto min-w-[200px]"
          />
          <Button type="submit" size="sm" disabled={connecting || !ssid.trim()}>
            {connecting ? "Connecting..." : "Connect"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
