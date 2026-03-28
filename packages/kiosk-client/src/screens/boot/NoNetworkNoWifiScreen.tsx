import EthernetIcon from "../../components/icons/EthernetIcon.js";
import LoadingDots from "../../components/LoadingDots.js";
import { useT } from "../../i18n/useT.js";

export default function NoNetworkNoWifiScreen() {
  const t = useT();

  return (
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
  );
}
