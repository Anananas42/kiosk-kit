import { ReleaseType } from "@kioskkit/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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
  hostname: text("hostname"),
  pairingCode: text("pairing_code").unique(),
  backupIntervalHours: integer("backup_interval_hours").notNull().default(2),
  maxRetainedBackups: integer("max_retained_backups").notNull().default(30),
  validateProxyHash: boolean("validate_proxy_hash").notNull().default(true),
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
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("backups_device_id_created_at_idx").on(table.deviceId, table.createdAt.desc())],
);

export const deviceOperations = pgTable(
  "device_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("device_ops_device_type_started_idx").on(
      table.deviceId,
      table.type,
      table.startedAt.desc(),
    ),
  ],
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull(),
    releaseType: text("release_type").notNull().default(ReleaseType.Ota),
    otaAssetUrl: text("ota_asset_url"),
    otaSha256: text("ota_sha256"),
    appAssetUrl: text("app_asset_url"),
    appSha256: text("app_sha256"),
    adminManifest: jsonb("admin_manifest").$type<Record<string, string>>(),
    releaseNotes: text("release_notes"),
    isPublished: boolean("is_published").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    publishedBy: text("published_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("releases_version_unique").on(table.version),
    unique("releases_ota_sha256_unique").on(table.otaSha256),
    unique("releases_app_sha256_unique").on(table.appSha256),
    check(
      "releases_at_least_one_asset",
      sql`${table.otaAssetUrl} IS NOT NULL OR ${table.appAssetUrl} IS NOT NULL`,
    ),
  ],
);

export const updateTypeEnum = pgEnum("update_type", ["full", "live"]);
export const updateActionEnum = pgEnum("update_action", ["push", "install"]);
export const updateResultEnum = pgEnum("update_result", ["pending", "success", "failed"]);

export const deviceUpdateOps = pgTable(
  "device_update_ops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    updateType: updateTypeEnum("update_type").notNull(),
    action: updateActionEnum("action").notNull(),
    version: text("version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    result: updateResultEnum("result").notNull().default("pending"),
    error: text("error"),
    triggeredBy: text("triggered_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("device_update_ops_device_started_idx").on(table.deviceId, table.startedAt.desc()),
  ],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
