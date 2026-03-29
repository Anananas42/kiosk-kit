import { ShieldAlert } from "lucide-react";
import { useTranslate } from "../hooks/useTranslate.js";

export function IntegrityOverlay() {
  const t = useTranslate();

  return (
    <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
      <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
        <ShieldAlert className="text-destructive h-7 w-7" />
      </div>
      <p className="text-foreground font-medium">{t("deviceDetail.overlay.integrityError")}</p>
      <p className="text-muted-foreground max-w-sm text-center text-sm">
        {t("deviceDetail.overlay.integrityErrorDescription")}
      </p>
    </div>
  );
}
