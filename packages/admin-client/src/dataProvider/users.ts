import type { DataProvider, Identifier } from "react-admin";
import { trpc } from "../trpc.js";

function toStringId(id: Identifier): string {
  return String(id);
}

export const usersDataProvider: DataProvider = {
  getList: async () => {
    const data = await trpc["users.list"].query();
    return { data, total: data.length };
  },

  getOne: async (_resource, params) => {
    const data = await trpc["users.getOne"].query({
      id: toStringId(params.id),
    });
    return { data };
  },

  getMany: async (_resource, params) => {
    const ids = params.ids.map(toStringId);
    const all = await trpc["users.list"].query();
    return { data: all.filter((u) => ids.includes(u.id)) };
  },

  getManyReference: async () => {
    throw new Error("getManyReference is not supported for users");
  },

  create: async () => {
    throw new Error("Cannot create users");
  },

  update: async () => {
    throw new Error("Cannot update users");
  },

  updateMany: async () => {
    throw new Error("updateMany is not supported");
  },

  delete: async () => {
    throw new Error("Cannot delete users");
  },

  deleteMany: async () => {
    throw new Error("Cannot delete users");
  },
} as DataProvider;
