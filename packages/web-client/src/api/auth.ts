import type { User } from "@kioskkit/shared";
import { trpc } from "../trpc.js";

export async function fetchMe(): Promise<User | null> {
  const result = await trpc.me.query();
  return result.user;
}

export function logout(): Promise<Response> {
  return fetch("/api/auth/logout", { method: "POST" });
}
