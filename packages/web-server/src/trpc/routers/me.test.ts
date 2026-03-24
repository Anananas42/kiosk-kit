import { describe, expect, it } from "vitest";
import type { Db } from "../../db/index.js";
import type { users } from "../../db/schema.js";
import { appRouter } from "../router.js";
import { createCallerFactory } from "../trpc.js";

type User = typeof users.$inferSelect;

const createCaller = createCallerFactory(appRouter);

const adminUser: User = {
  id: "admin-1",
  email: "admin@test.com",
  name: "Admin",
  googleId: "g-admin",
  role: "admin",
  stripeCustomerId: null,
  createdAt: new Date(),
};

const customerUser: User = {
  id: "user-1",
  email: "test@test.com",
  name: "Test User",
  googleId: "g-1",
  role: "customer",
  stripeCustomerId: null,
  createdAt: new Date(),
};

describe("me procedure", () => {
  it("returns null user when not authenticated", async () => {
    const caller = createCaller({ db: {} as Db, user: null, session: null });
    const result = await caller.me();
    expect(result).toEqual({ user: null });
  });

  it("returns user when authenticated as admin", async () => {
    const caller = createCaller({
      db: {} as Db,
      user: adminUser,
      session: { id: "s-1", userId: adminUser.id, expiresAt: new Date() },
    });
    const result = await caller.me();
    expect(result).toEqual({
      user: {
        id: "admin-1",
        name: "Admin",
        email: "admin@test.com",
        role: "admin",
      },
    });
  });

  it("returns user when authenticated as customer", async () => {
    const caller = createCaller({
      db: {} as Db,
      user: customerUser,
      session: { id: "s-2", userId: customerUser.id, expiresAt: new Date() },
    });
    const result = await caller.me();
    expect(result).toEqual({
      user: {
        id: "user-1",
        name: "Test User",
        email: "test@test.com",
        role: "customer",
      },
    });
  });

  it("returns empty string for null name", async () => {
    const userWithNullName = { ...customerUser, name: null };
    const caller = createCaller({
      db: {} as Db,
      user: userWithNullName,
      session: { id: "s-3", userId: userWithNullName.id, expiresAt: new Date() },
    });
    const result = await caller.me();
    expect(result.user?.name).toBe("");
  });
});
