import type { DataProvider } from "react-admin";

const notImplemented = (method: string) => (): never => {
  throw new Error(`dataProvider.${method} is not implemented`);
};

export const dataProvider: DataProvider = {
  getList: notImplemented("getList"),
  getOne: notImplemented("getOne"),
  getMany: notImplemented("getMany"),
  getManyReference: notImplemented("getManyReference"),
  create: notImplemented("create"),
  update: notImplemented("update"),
  updateMany: notImplemented("updateMany"),
  delete: notImplemented("delete"),
  deleteMany: notImplemented("deleteMany"),
};
