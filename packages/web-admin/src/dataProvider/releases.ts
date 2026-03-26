import type { DataProvider, Identifier } from "react-admin";
import { trpc } from "../trpc.js";

function toStringId(id: Identifier): string {
  return String(id);
}

export const releasesDataProvider: DataProvider = {
  getList: async () => {
    const data = await trpc["releases.list"].query();
    return { data, total: data.length };
  },

  getOne: async (_resource, params) => {
    const id = toStringId(params.id);
    const all = await trpc["releases.list"].query();
    const item = all.find((r) => r.id === id);
    if (!item) throw new Error("Release not found");
    return { data: item };
  },

  getMany: async (_resource, params) => {
    const ids = params.ids.map(toStringId);
    const all = await trpc["releases.list"].query();
    return { data: all.filter((r) => ids.includes(r.id)) };
  },

  getManyReference: async () => {
    throw new Error("getManyReference is not supported for releases");
  },

  create: async (_resource, params) => {
    const { version, githubAssetUrl, sha256, releaseNotes } = params.data as {
      version: string;
      githubAssetUrl: string;
      sha256: string;
      releaseNotes?: string;
    };
    const result = await trpc["releases.publish"].mutate({
      version,
      githubAssetUrl,
      sha256,
      releaseNotes,
    });
    return { data: result };
  },

  update: async (_resource, params) => {
    const { id, releaseNotes, isPublished, isArchived } = params.data as {
      id: string;
      releaseNotes?: string;
      isPublished?: boolean;
      isArchived?: boolean;
    };
    const result = await trpc["releases.update"].mutate({
      id,
      releaseNotes,
      isPublished,
      isArchived,
    });
    return { data: result };
  },

  updateMany: async () => {
    throw new Error("Cannot bulk update releases");
  },

  delete: async () => {
    throw new Error("Cannot delete releases");
  },

  deleteMany: async () => {
    throw new Error("Cannot delete releases");
  },
} as DataProvider;
