import type { DataProvider, Identifier } from "react-admin";
import { trpc } from "../trpc.js";

function toStringId(id: Identifier): string {
  return String(id);
}

export const devicesDataProvider: DataProvider = {
  getList: async () => {
    const data = await trpc["devices.list"].query();
    return { data, total: data.length };
  },

  getOne: async (_resource, params) => {
    const data = await trpc["devices.get"].query({
      id: toStringId(params.id),
    });
    return { data };
  },

  getMany: async (_resource, params) => {
    const ids = params.ids.map(toStringId);
    const all = await trpc["devices.list"].query();
    return { data: all.filter((d) => ids.includes(d.id)) };
  },

  getManyReference: async (_resource, params) => {
    const all = await trpc["devices.list"].query();
    const id = toStringId(params.id);
    const data = all.filter((d) => String(d[params.target as keyof typeof d]) === id);
    return { data, total: data.length };
  },

  create: async (_resource, params) => {
    const data = await trpc["devices.create"].mutate(
      params.data as { name: string; tailscaleIp: string; userId: string },
    );
    return { data };
  },

  update: async (_resource, params) => {
    const id = toStringId(params.id);
    const { name, tailscaleIp, userId } = params.data as {
      name?: string;
      tailscaleIp?: string;
      userId?: string;
    };
    const data = await trpc["devices.update"].mutate({
      id,
      name,
      tailscaleIp,
      userId,
    });
    return { data };
  },

  updateMany: async () => {
    throw new Error("updateMany is not supported");
  },

  delete: async (_resource, params) => {
    const id = toStringId(params.id);
    await trpc["devices.delete"].mutate({ id });
    return { data: { id } } as { data: { id: string } };
  },

  deleteMany: async (_resource, params) => {
    const ids = params.ids.map(toStringId);
    await Promise.all(ids.map((id) => trpc["devices.delete"].mutate({ id })));
    return { data: ids };
  },
} as DataProvider;
