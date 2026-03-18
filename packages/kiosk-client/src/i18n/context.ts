import { createContext } from "react";

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

export const I18nContext = createContext<TFunction>((k) => k);
