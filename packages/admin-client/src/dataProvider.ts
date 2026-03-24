import type { DataProvider, Identifier } from "react-admin";
import { trpc } from "./trpc.js";

type ResourceName = "devices" | "users";

function toStringId(id: Identifier): string {
  return String(id);
}

// react-admin's DataProvider generics are overly strict for tRPC return types.
// The runtime shapes are correct — every record has { id: string, ... }.
export const dataProvider = {
  getList: async (resource) => {
    const name = resource as ResourceName;
    if (name === "devices") {
      const data = await trpc["devices.list"].query();
      return { data, total: data.length };
    }
    if (name === "users") {
      const data = await trpc["users.list"].query();
      return { data, total: data.length };
    }
    throw new Error(`Unknown resource: ${resource}`);
  },

  getOne: async (resource, params) => {
    const name = resource as ResourceName;
    const id = toStringId(params.id);
    if (name === "devices") {
      const data = await trpc["devices.get"].query({ id });
      return { data };
    }
    if (name === "users") {
      const data = await trpc["users.getOne"].query({ id });
      return { data };
    }
    throw new Error(`Unknown resource: ${resource}`);
  },

  getMany: async (resource, params) => {
    const name = resource as ResourceName;
    const ids = params.ids.map(toStringId);
    if (name === "devices") {
      const all = await trpc["devices.list"].query();
      const data = all.filter((d) => ids.includes(d.id));
      return { data };
    }
    if (name === "users") {
      const all = await trpc["users.list"].query();
      const data = all.filter((u) => ids.includes(u.id));
      return { data };
    }
    throw new Error(`Unknown resource: ${resource}`);
  },

  getManyReference: async (resource, params) => {
    const name = resource as ResourceName;
    if (name === "devices") {
      const all = await trpc["devices.list"].query();
      const id = toStringId(params.id);
      const data = all.filter(
        (d) => String(d[params.target as keyof typeof d]) === id,
      );
      return { data, total: data.length };
    }
    throw new Error(`Unknown resource: ${resource}`);
  },

  create: async (resource, params) => {
    const name = resource as ResourceName;
    if (name === "devices") {
      const data = await trpc["devices.create"].mutate(
        params.data as { name: string; tailscaleIp: string; userId: string },
      );
      return { data };
    }
    throw new Error(`Cannot create ${resource}`);
  },

  update: async (resource, params) => {
    const name = resource as ResourceName;
    if (name === "devices") {
      const id = toStringId(params.id);
      const { name: deviceName, tailscaleIp, userId } = params.data as {
        name?: string;
        tailscaleIp?: string;
        userId?: string;
      };
      const data = await trpc["devices.update"].mutate({
        id,
        name: deviceName,
        tailscaleIp,
        userId,
      });
      return { data };
    }
    throw new Error(`Cannot update ${resource}`);
  },

  updateMany: async () => {
    throw new Error("updateMany is not supported");
  },

  delete: async (resource, params) => {
    const name = resource as ResourceName;
    if (name === "devices") {
      const id = toStringId(params.id);
      await trpc["devices.delete"].mutate({ id });
      return { data: { id } } as { data: { id: string } };
    }
    throw new Error(`Cannot delete ${resource}`);
  },

  deleteMany: async (resource, params) => {
    const name = resource as ResourceName;
    if (name === "devices") {
      const ids = params.ids.map(toStringId);
      await Promise.all(ids.map((id) => trpc["devices.delete"].mutate({ id })));
      return { data: ids };
    }
    throw new Error(`Cannot delete ${resource}`);
  },
} as DataProvider;
