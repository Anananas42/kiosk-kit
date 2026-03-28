import LoadingDots from "../../components/LoadingDots.js";
import { useT } from "../../i18n/useT.js";

interface PairingScreenProps {
  code: string;
}

function formatPairingCode(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 9) return code;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
}

export default function PairingScreen({ code }: PairingScreenProps) {
  const t = useT();

  return (
    <div className="boot-screen__content">
      <div className="boot-screen__title">{t("boot.pairingTitle")}</div>
      <div className="boot-screen__code">{formatPairingCode(code)}</div>
      <div className="boot-screen__subtitle">
        {t("boot.pairingHint")}
        <LoadingDots />
      </div>
    </div>
  );
}
