import crypto from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EXTEND_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

export async function createSession(db: Db, userId: string) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return id;
}

export async function validateSession(db: Db, sessionId: string) {
  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (result.length === 0) return null;

  const { session, user } = result[0];

  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  // Extend session if more than 15 days remain
  const timeLeft = session.expiresAt.getTime() - Date.now();
  if (timeLeft > EXTEND_THRESHOLD_MS) {
    // no-op: session still fresh
  } else {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt: newExpiry }).where(eq(sessions.id, sessionId));
  }

  return { session, user };
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
