import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "customer"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  googleId: text("google_id").notNull().unique(),
  role: userRoleEnum("role").notNull().default("customer"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tailscaleNodeId: text("tailscale_node_id").notNull().unique(),
  tailscaleIp: text("tailscale_ip"),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backups = pgTable(
  "backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    s3Key: text("s3_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("backups_device_id_created_at_idx").on(table.deviceId, table.createdAt.desc())],
);

export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull().unique(),
  githubAssetUrl: text("github_asset_url").notNull(),
  sha256: text("sha256").notNull(),
  releaseNotes: text("release_notes"),
  isPublished: boolean("is_published").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  publishedBy: text("published_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
