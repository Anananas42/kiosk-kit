import type { WifiStatus } from "@kioskkit/shared";

const MOCK_STATUS: WifiStatus = {
  current: { ssid: "HomeNetwork", signal: -45 },
  ethernet: false,
  saved: [
    { ssid: "HomeNetwork", inRange: true, signal: -45 },
    { ssid: "OfficeWifi", inRange: false },
  ],
  available: [
    { ssid: "Neighbor5G", signal: -68, security: "wpa" },
    { ssid: "CafeOpen", signal: -72, security: "open" },
    { ssid: "IoTNetwork", signal: -80, security: "wpa" },
  ],
};

export function getMockWifiStatus(): WifiStatus {
  return MOCK_STATUS;
}
