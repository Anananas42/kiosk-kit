import LoadingDots from "../../components/LoadingDots.js";
import { useT } from "../../i18n/useT.js";

export default function ConnectingCloudScreen() {
  const t = useT();

  return (
    <div className="boot-screen__content">
      <div className="boot-screen__spinner" />
      <div className="boot-screen__title">
        {t("boot.connectingCloud")}
        <LoadingDots />
      </div>
      <div className="boot-screen__subtitle">{t("boot.connectingCloudHint")}</div>
    </div>
  );
}
