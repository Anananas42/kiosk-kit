import type { CreateTRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@kioskkit/kiosk-server/trpc";

export type DeviceTrpcClient = CreateTRPCClient<AppRouter>;

export function createDeviceTrpcClient(deviceId: string): DeviceTrpcClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `/api/devices/${deviceId}/kiosk/trpc`,
      }),
    ],
  });
}
