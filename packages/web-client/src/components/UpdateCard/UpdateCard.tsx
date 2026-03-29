import { Card, CardContent, Spinner } from "@kioskkit/ui";
import { useState } from "react";
import { useTranslate } from "../../hooks/useTranslate.js";
import { useUpdateCardState } from "../../hooks/useUpdateCardState.js";
import { StateContent } from "./StateContent.js";

export function UpdateCard({ deviceId }: { deviceId: string }) {
  const t = useTranslate();
  const [actionError, setActionError] = useState<string | null>(null);
  const card = useUpdateCardState(deviceId);

  const onError = (e: Error) => setActionError(e.message ?? t("update.failed"));

  const handlePush = () => {
    setActionError(null);
    card.push.mutate(undefined, { onError });
  };

  const handleInstall = () => {
    setActionError(null);
    card.install.mutate(undefined, { onError });
  };

  const handleCancel = () => {
    setActionError(null);
    card.cancel.mutate(undefined, { onError });
  };

  if (card.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <Spinner className="h-4 w-4" />
          <span className="text-muted-foreground text-sm">{t("update.checking")}</span>
        </CardContent>
      </Card>
    );
  }

  if (!card.hasData) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">{t("update.loadError")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("update.title")}</span>
          {card.derived.currentVersion && (
            <span className="text-muted-foreground text-xs">
              {t("update.currentVersion", { version: card.derived.currentVersion })}
            </span>
          )}
        </div>

        {actionError && <p className="text-destructive text-xs">{actionError}</p>}

        <StateContent
          card={card}
          onPush={handlePush}
          onInstall={handleInstall}
          onCancel={handleCancel}
        />
      </CardContent>
    </Card>
  );
}
