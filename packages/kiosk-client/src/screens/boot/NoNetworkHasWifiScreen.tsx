import WifiOffIcon from "../../components/icons/WifiOffIcon.js";
import LoadingDots from "../../components/LoadingDots.js";
import { useT } from "../../i18n/useT.js";

export default function NoNetworkHasWifiScreen() {
  const t = useT();

  return (
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
  );
}
