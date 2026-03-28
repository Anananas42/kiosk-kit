import LoadingDots from "../../components/LoadingDots.js";
import { useT } from "../../i18n/useT.js";

export default function ConnectingScreen() {
  const t = useT();

  return (
    <div className="boot-screen__content">
      <div className="boot-screen__spinner" />
      <div className="boot-screen__title">
        {t("boot.connecting")}
        <LoadingDots />
      </div>
    </div>
  );
}
