import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

import { ReleaseType } from "@kioskkit/shared";
import { createDb } from "./db/index.js";
import { backups, devices, releases, users } from "./db/schema.js";

// Deterministic IDs — agents can reference these directly
const CUSTOMER_USER_ID = "test-customer-user-id";

const DEVICE_IDS = [
  "a0000000-0000-4000-8000-000000000001",
  "a0000000-0000-4000-8000-000000000002",
  "a0000000-0000-4000-8000-000000000003",
] as const;

const BACKUP_IDS = [
  "b0000000-0000-4000-8000-000000000001",
  "b0000000-0000-4000-8000-000000000002",
  "b0000000-0000-4000-8000-000000000003",
  "b0000000-0000-4000-8000-000000000004",
] as const;

const RELEASE_IDS = [
  "c0000000-0000-4000-8000-000000000001",
  "c0000000-0000-4000-8000-000000000002",
  "c0000000-0000-4000-8000-000000000003",
] as const;

const ADMIN_USER_ID = "test-user-id"; // matches seed-test-user.ts

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = createDb(connectionString);

  // --- Customer user ---
  await db
    .insert(users)
    .values({
      id: CUSTOMER_USER_ID,
      email: "customer@kioskkit.local",
      name: "Test Customer",
      googleId: "test-customer-google-id",
      role: "customer",
    })
    .onConflictDoNothing({ target: users.id });
  console.log("Seeded customer user");

  // --- Devices ---
  const deviceValues = [
    {
      id: DEVICE_IDS[0],
      tailscaleNodeId: "ts-node-kiosk-lobby",
      tailscaleIp: "100.64.0.1",
      userId: ADMIN_USER_ID,
      name: "Lobby Kiosk",
      hostname: "kiosk-lobby",
      pairingCode: "PAIR-001",
      lastSeen: new Date("2026-03-28T10:00:00Z"),
    },
    {
      id: DEVICE_IDS[1],
      tailscaleNodeId: "ts-node-kiosk-cafe",
      tailscaleIp: "100.64.0.2",
      userId: ADMIN_USER_ID,
      name: "Cafe Kiosk",
      hostname: "kiosk-cafe",
      pairingCode: "PAIR-002",
      lastSeen: new Date("2026-03-29T08:30:00Z"),
    },
    {
      id: DEVICE_IDS[2],
      tailscaleNodeId: "ts-node-kiosk-warehouse",
      tailscaleIp: "100.64.0.3",
      userId: ADMIN_USER_ID,
      name: "Warehouse Kiosk",
      hostname: "kiosk-warehouse",
      pairingCode: "PAIR-003",
      lastSeen: null, // never seen — tests "offline" state
    },
  ];

  await db.insert(devices).values(deviceValues).onConflictDoNothing({ target: devices.id });
  console.log("Seeded devices");

  // --- Backups ---
  const backupValues = [
    {
      id: BACKUP_IDS[0],
      deviceId: DEVICE_IDS[0],
      s3Key: "backups/kiosk-lobby/2026-03-25T12-00-00Z.tar.gz",
      sizeBytes: 52_428_800, // 50 MB
      createdAt: new Date("2026-03-25T12:00:00Z"),
    },
    {
      id: BACKUP_IDS[1],
      deviceId: DEVICE_IDS[0],
      s3Key: "backups/kiosk-lobby/2026-03-28T12-00-00Z.tar.gz",
      sizeBytes: 53_477_376, // ~51 MB
      createdAt: new Date("2026-03-28T12:00:00Z"),
    },
    {
      id: BACKUP_IDS[2],
      deviceId: DEVICE_IDS[1],
      s3Key: "backups/kiosk-cafe/2026-03-27T09-00-00Z.tar.gz",
      sizeBytes: 41_943_040, // 40 MB
      createdAt: new Date("2026-03-27T09:00:00Z"),
    },
    {
      id: BACKUP_IDS[3],
      deviceId: DEVICE_IDS[1],
      s3Key: "backups/kiosk-cafe/2026-03-29T09-00-00Z.tar.gz",
      sizeBytes: 42_991_616, // ~41 MB
      createdAt: new Date("2026-03-29T09:00:00Z"),
    },
  ];

  await db.insert(backups).values(backupValues).onConflictDoNothing({ target: backups.id });
  console.log("Seeded backups");

  // --- Releases ---
  const releaseValues = [
    {
      id: RELEASE_IDS[0],
      version: "1.0.0",
      releaseType: ReleaseType.Ota,
      otaAssetUrl:
        "https://github.com/Anananas42/kiosk-kit/releases/download/v1.0.0/kioskkit-1.0.0.img.gz",
      otaSha256: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      releaseNotes: "Initial stable release with kiosk mode and basic POS.",
      isPublished: true,
      isArchived: false,
      publishedBy: ADMIN_USER_ID,
      publishedAt: new Date("2026-01-15T10:00:00Z"),
    },
    {
      id: RELEASE_IDS[1],
      version: "1.1.0",
      releaseType: ReleaseType.Ota,
      otaAssetUrl:
        "https://github.com/Anananas42/kiosk-kit/releases/download/v1.1.0/kioskkit-1.1.0.img.gz",
      otaSha256: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      releaseNotes: "Added remote backup support and improved device pairing flow.",
      isPublished: true,
      isArchived: false,
      publishedBy: ADMIN_USER_ID,
      publishedAt: new Date("2026-02-20T14:00:00Z"),
    },
    {
      id: RELEASE_IDS[2],
      version: "1.2.0-rc.1",
      releaseType: ReleaseType.Ota,
      otaAssetUrl:
        "https://github.com/Anananas42/kiosk-kit/releases/download/v1.2.0-rc.1/kioskkit-1.2.0-rc.1.img.gz",
      otaSha256: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      releaseNotes: "Release candidate — new dashboard and OTA update engine.",
      isPublished: false,
      isArchived: false,
      publishedBy: ADMIN_USER_ID,
      publishedAt: new Date("2026-03-28T16:00:00Z"),
    },
  ];

  await db.insert(releases).values(releaseValues).onConflictDoNothing({ target: releases.id });
  console.log("Seeded releases");

  console.log("Done seeding test data.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
