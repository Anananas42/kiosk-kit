import type { AuthProvider } from "react-admin";
import { trpc } from "./trpc.js";

export const authProvider: AuthProvider = {
  login: async () => {
    window.location.href = "/api/auth/google";
  },

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
  },

  checkAuth: async () => {
    const { user } = await trpc.me.query();
    if (!user || user.role !== "admin") {
      throw new Error("Not authenticated");
    }
  },

  checkError: async (error: { status?: number }) => {
    if (error.status === 401 || error.status === 403) {
      throw new Error("Unauthorized");
    }
  },

  getIdentity: async () => {
    const { user } = await trpc.me.query();
    if (!user) {
      throw new Error("Not authenticated");
    }
    return {
      id: user.id,
      fullName: user.name ?? user.email,
    };
  },

  getPermissions: async () => {
    const { user } = await trpc.me.query();
    if (!user || user.role !== "admin") {
      throw new Error("Admin access required");
    }
    return user.role;
  },
};
