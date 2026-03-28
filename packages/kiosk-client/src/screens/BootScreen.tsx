import LoadingDots from "../components/LoadingDots.js";
import type { BootState } from "../hooks/useBootState.js";
import { useT } from "../i18n/useT.js";

interface BootScreenProps {
  state: Exclude<BootState, "ready">;
  pairingCode: string;
}

function formatPairingCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 9) return code;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
}

export default function BootScreen({ state, pairingCode }: BootScreenProps) {
  const t = useT();

  return (
    <div className="app">
      <div className="boot-screen">
        {state === "connecting" && (
          <div className="boot-screen__content">
            <div className="boot-screen__spinner" />
            <div className="boot-screen__title">
              {t("boot.connecting")}
              <LoadingDots />
            </div>
          </div>
        )}

        {state === "no-network-no-wifi" && (
          <div className="boot-screen__content">
            <div className="boot-screen__icon">
              <EthernetIcon />
            </div>
            <div className="boot-screen__title">{t("boot.plugEthernet")}</div>
            <div className="boot-screen__subtitle">
              {t("boot.plugEthernetHint")}
              <LoadingDots />
            </div>
          </div>
        )}

        {state === "no-network-has-wifi" && (
          <div className="boot-screen__content">
            <div className="boot-screen__icon">
              <WifiOffIcon />
            </div>
            <div className="boot-screen__title">{t("boot.noInternet")}</div>
            <div className="boot-screen__subtitle">
              {t("boot.noInternetHint")}
              <LoadingDots />
            </div>
          </div>
        )}

        {state === "connecting-cloud" && (
          <div className="boot-screen__content">
            <div className="boot-screen__spinner" />
            <div className="boot-screen__title">
              {t("boot.connectingCloud")}
              <LoadingDots />
            </div>
            <div className="boot-screen__subtitle">{t("boot.connectingCloudHint")}</div>
          </div>
        )}

        {state === "pairing" && (
          <div className="boot-screen__content">
            <div className="boot-screen__title">{t("boot.pairingTitle")}</div>
            <div className="boot-screen__code">{formatPairingCode(pairingCode)}</div>
            <div className="boot-screen__subtitle">
              {t("boot.pairingHint")}
              <LoadingDots />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EthernetIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Ethernet cable"
    >
      <title>Ethernet cable</title>
      <path d="M6 20v-4" />
      <path d="M10 20v-8" />
      <path d="M14 20v-8" />
      <path d="M18 20v-4" />
      <path d="M6 16h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2z" />
      <path d="M8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

function WifiOffIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="No WiFi"
    >
      <title>No WiFi</title>
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <path d="M13.83 10.17A10 10 0 0 1 19 12.86" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5.21A15 15 0 0 1 22 8.82" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
