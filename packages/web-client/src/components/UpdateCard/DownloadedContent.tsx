import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@kioskkit/ui";
import { useTranslate } from "../../hooks/useTranslate.js";
import type { DerivedUpdate } from "../../hooks/useUpdateCardState.js";

export function DownloadedContent({
  derived,
  onInstall,
  onCancel,
  disabled,
}: {
  derived: DerivedUpdate;
  onInstall: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const t = useTranslate();
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm">
        {t("update.readyToInstall", { version: derived.targetVersion ?? "" })}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={disabled}>
          {t("common.cancel")}
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" disabled={disabled}>
              {t("update.install")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("update.installDialog.title")}</DialogTitle>
              <DialogDescription>
                {derived.type === "live"
                  ? t("update.installDialog.descriptionLive")
                  : t("update.installDialog.descriptionFull")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("common.cancel")}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={onInstall}>{t("update.confirmInstall")}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
