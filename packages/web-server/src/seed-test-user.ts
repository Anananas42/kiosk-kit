import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "./db/index.js";
import { sessions, users } from "./db/schema.js";

const SESSION_TOKEN = "test-session-token-for-agent";
const USER_ID = "test-user-id";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = createDb(connectionString);

  // Upsert test user
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, USER_ID))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      id: USER_ID,
      email: "test@kioskkit.local",
      name: "Test User",
      googleId: "test-google-id",
      role: "admin",
    });
  }

  // Upsert session — delete old one first to reset expiry
  await db.delete(sessions).where(eq(sessions.id, SESSION_TOKEN));
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
  await db.insert(sessions).values({
    id: SESSION_TOKEN,
    userId: USER_ID,
    expiresAt,
  });

  // Output token as the last line so callers can capture it
  console.log(SESSION_TOKEN);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
