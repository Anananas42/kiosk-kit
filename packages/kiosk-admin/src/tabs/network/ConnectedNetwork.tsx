import type { WifiStatus } from "@kioskkit/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@kioskkit/ui";
import { SignalIcon } from "./SignalIcon.js";

interface ConnectedNetworkProps {
  current: NonNullable<WifiStatus["current"]>;
  forgetting: string | null;
  onForget: (ssid: string) => void;
}

export function ConnectedNetwork({ current, forgetting, onForget }: ConnectedNetworkProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Network</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="w-8">
                <SignalIcon dBm={current.signal} />
              </TableCell>
              <TableCell className="font-medium">{current.ssid}</TableCell>
              <TableCell>
                <Badge className="bg-success text-white">Connected</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={forgetting === current.ssid}
                  onClick={() => onForget(current.ssid)}
                >
                  {forgetting === current.ssid ? "Forgetting..." : "Forget"}
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
