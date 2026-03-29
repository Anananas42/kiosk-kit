import type { DataProvider, Identifier } from "react-admin";
import { trpc } from "../trpc.js";

function toStringId(id: Identifier): string {
  return String(id);
}

export const devicesDataProvider: DataProvider = {
  getList: async (_resource, params) => {
    const filter = params?.filter ?? {};
    const assigned =
      filter.assigned !== undefined
        ? filter.assigned === "true" || filter.assigned === true
        : undefined;
    const all = await trpc["devices.listAll"].query({ assigned });
    const data =
      filter.online !== undefined
        ? all.filter((d) => d.online === (filter.online === "true" || filter.online === true))
        : all;
    return { data, total: data.length };
  },

  getOne: async (_resource, params) => {
    const data = await trpc["devices.get"].query({
      id: toStringId(params.id),
    });
    return { data };
  },

  getMany: async (_resource, params) => {
    const data = await Promise.all(
      params.ids.map((id) => trpc["devices.get"].query({ id: toStringId(id) })),
    );
    return { data };
  },

  getManyReference: async (_resource, params) => {
    const all = await trpc["devices.listAll"].query();
    const id = toStringId(params.id);
    const data = all.filter((d) => String(d[params.target as keyof typeof d]) === id);
    return { data, total: data.length };
  },

  create: async () => {
    throw new Error("Device creation is not supported — devices come from Tailscale");
  },

  update: async (_resource, params) => {
    const id = toStringId(params.id);
    const { name, userId, hashVerifyEnabled } = params.data as {
      name?: string;
      userId?: string | null;
      hashVerifyEnabled?: boolean;
    };
    const previousUserId = (params.previousData as { userId?: string | null })?.userId;

    const promises: Promise<unknown>[] = [];

    if (name !== undefined) {
      promises.push(trpc["devices.update"].mutate({ id, name, hashVerifyEnabled }));
    } else if (hashVerifyEnabled !== undefined) {
      promises.push(
        trpc["devices.update"].mutate({
          id,
          name: params.previousData?.name ?? "",
          hashVerifyEnabled,
        }),
      );
    }

    if (userId !== previousUserId) {
      promises.push(trpc["devices.assign"].mutate({ id, userId: userId ?? null }));
    }

    await Promise.all(promises);

    const data = await trpc["devices.get"].query({ id });
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
