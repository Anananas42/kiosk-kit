import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

function DeviceDetailView({
  name,
  status,
}: {
  name: string;
  status: "online" | "offline" | "checking";
}) {
  return (
    <div className="flex flex-col gap-4">
      <Button variant="link" className="w-fit px-0">
        &larr; Back to devices
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{name}</CardTitle>
          {status === "checking" ? (
            <Badge variant="secondary">Checking...</Badge>
          ) : status === "online" ? (
            <Badge variant="default">Online</Badge>
          ) : (
            <Badge variant="destructive">Offline</Badge>
          )}
        </CardHeader>
        {status === "offline" && (
          <CardContent>
            <p className="text-sm text-destructive">
              Device is offline. Management is unavailable.
            </p>
          </CardContent>
        )}
      </Card>

      {status === "online" && (
        <Card className="flex flex-1 flex-col overflow-hidden">
          <CardContent className="flex items-center justify-center p-12">
            <p className="text-muted-foreground">Device admin iframe would load here</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const meta: Meta<typeof DeviceDetailView> = {
  title: "Views/DeviceDetail",
  component: DeviceDetailView,
};

export default meta;
type Story = StoryObj<typeof DeviceDetailView>;

export const Online: Story = {
  args: {
    name: "Lobby Kiosk",
    status: "online",
  },
};

export const Offline: Story = {
  args: {
    name: "Conference Room A",
    status: "offline",
  },
};

export const Checking: Story = {
  args: {
    name: "Reception Display",
    status: "checking",
  },
};
