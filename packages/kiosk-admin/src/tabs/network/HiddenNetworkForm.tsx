import { Button, Card, CardContent, CardHeader, CardTitle, Input, Spinner } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

export function HiddenNetworkForm() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");

  const connectMutation = useMutation({
    mutationFn: (input: { ssid: string; password?: string }) =>
      trpc["admin.network.connect"].mutate(input),
    onSuccess: () => {
      toast.success("Connected");
      setShowForm(false);
      setSsid("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: queryKeys.network.status() });
    },
    onError: () => toast.error("Could not connect — check password and try again"),
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
      <CardHeader>
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
