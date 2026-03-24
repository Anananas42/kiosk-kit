import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "customer"]);

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRoleSchema,
});

export type User = z.infer<typeof UserSchema>;

export const MeOutputSchema = z.object({
  user: UserSchema.nullable(),
});

export type MeOutput = z.infer<typeof MeOutputSchema>;

// ── Catalog ─────────────────────────────────────────────────────────────────

export const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.string(),
  price: z.string(),
  dphRate: z.string(),
});

export const CatalogCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  preorder: z.boolean(),
  items: z.array(CatalogItemSchema),
});

export const CatalogListOutputSchema = z.array(CatalogCategorySchema);

// ── Device schemas ──────────────────────────────────────────────────

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export const TailscaleIpSchema = z.string().refine(
  (ip) => {
    if (!IP_REGEX.test(ip)) return false;
    return ip.split(".").every((octet) => {
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  },
  { message: "Must be a valid IP address" },
);

export const DeviceSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  name: z.string(),
  tailscaleIp: z.string().optional(),
  createdAt: z.coerce.string(),
});

export type Device = z.infer<typeof DeviceSchema>;

export const DeviceCreateInputSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  tailscaleIp: TailscaleIpSchema,
  userId: z.string().trim().min(1, "userId is required"),
});

export type DeviceCreateInput = z.infer<typeof DeviceCreateInputSchema>;

export const DeviceUpdateInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).optional(),
  tailscaleIp: TailscaleIpSchema.optional(),
  userId: z.string().trim().min(1).optional(),
});

export type DeviceUpdateInput = z.infer<typeof DeviceUpdateInputSchema>;
