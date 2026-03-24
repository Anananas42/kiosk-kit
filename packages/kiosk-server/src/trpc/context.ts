import type { Store } from "../db/store.js";

export type TrpcContext = {
  store: Store;
};
