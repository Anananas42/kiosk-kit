import { useCallback } from "react";
import type { PrimitiveType } from "react-intl";
import { useIntl } from "react-intl";
import type enUS from "../../lang/en-US.json";

export type MessageKey = keyof typeof enUS;

export function useTranslate() {
  const intl = useIntl();
  return useCallback(
    (id: MessageKey, values?: Record<string, PrimitiveType>) => intl.formatMessage({ id }, values),
    [intl],
  );
}
