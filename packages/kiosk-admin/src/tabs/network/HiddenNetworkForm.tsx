import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@kioskkit/ui";
import type { FormEvent } from "react";
import { useState } from "react";
import { PasswordInput } from "./PasswordInput.js";
import { useConnectMutation } from "./useConnectMutation.js";

export function HiddenNetworkForm() {
  const [showForm, setShowForm] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");

  const connectMutation = useConnectMutation(() => {
    setShowForm(false);
    setSsid("");
    setPassword("");
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) return;
    connectMutation.mutate({ ssid: ssid.trim(), password: password || undefined });
  };

  if (!showForm) {
    return (
      <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
        Connect to hidden network
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Hidden Network</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            type="text"
            placeholder="Network name (SSID)"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            disabled={connectMutation.isPending}
            autoComplete="off"
            name="wifi-ssid-hidden"
            className="w-auto min-w-[300px]"
          />
          <PasswordInput
            value={password}
            onChange={setPassword}
            disabled={connectMutation.isPending}
            placeholder="Password (optional)"
            ssid="hidden"
          />
          <Button
            type="submit"
            size="sm"
            loading={connectMutation.isPending}
            disabled={!ssid.trim()}
          >
            Connect
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowForm(false);
              setSsid("");
              setPassword("");
            }}
          >
            Cancel
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
