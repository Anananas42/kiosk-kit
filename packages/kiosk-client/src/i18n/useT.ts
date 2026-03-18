import { useContext } from "react";
import { I18nContext } from "./context.js";

export function useT() {
  return useContext(I18nContext);
}
