import { BootState } from "../hooks/useBootState.js";
import ConnectingCloudScreen from "./boot/ConnectingCloudScreen.js";
import ConnectingScreen from "./boot/ConnectingScreen.js";
import NoNetworkHasWifiScreen from "./boot/NoNetworkHasWifiScreen.js";
import NoNetworkNoWifiScreen from "./boot/NoNetworkNoWifiScreen.js";
import PairingScreen from "./boot/PairingScreen.js";

interface BootScreenProps {
  state: Exclude<BootState, BootState.Ready>;
  pairingCode: string;
}

export default function BootScreen({ state, pairingCode }: BootScreenProps) {
  return (
    <div className="app">
      <div className="boot-screen">
        {state === BootState.Connecting && <ConnectingScreen />}
        {state === BootState.NoNetworkNoWifi && <NoNetworkNoWifiScreen />}
        {state === BootState.NoNetworkHasWifi && <NoNetworkHasWifiScreen />}
        {state === BootState.ConnectingCloud && <ConnectingCloudScreen />}
        {state === BootState.Pairing && <PairingScreen code={pairingCode} />}
      </div>
    </div>
  );
}
