import { Button, Card, CardContent, CardHeader, CardTitle, Input, Spinner } from "@kioskkit/ui";
import type { FormEvent } from "react";
import { useState } from "react";
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
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            placeholder="Network name (SSID)"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            disabled={connectMutation.isPending}
            className="w-auto min-w-[200px]"
          />
          <Input
            type="password"
            placeholder="Password (optional)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={connectMutation.isPending}
            className="w-auto min-w-[200px]"
          />
          <Button type="submit" size="sm" disabled={connectMutation.isPending || !ssid.trim()}>
            {connectMutation.isPending ? <Spinner className="mr-1" /> : null}
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
