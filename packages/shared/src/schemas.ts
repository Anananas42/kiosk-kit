import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "customer"]);

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRoleSchema,
});

export type User = z.infer<typeof UserSchema>;

export const UserListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: UserRoleSchema,
  createdAt: z.coerce.string(),
});

export type UserListItem = z.infer<typeof UserListItemSchema>;

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

export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

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

// ── Buyer schemas ───────────────────────────────────────────────────

export const BuyerSchema = z.object({
  id: z.number().int(),
  label: z.string(),
});

export type Buyer = z.infer<typeof BuyerSchema>;

export const BuyersResponseSchema = z.object({
  buyers: z.array(BuyerSchema),
});

export type BuyersResponse = z.infer<typeof BuyersResponseSchema>;

// ── Record schemas ──────────────────────────────────────────────────

export const RecordRequestSchema = z.object({
  buyer: z.number().int().min(1, "Invalid buyer"),
  count: z
    .number()
    .int()
    .refine((n) => n !== 0, "Invalid count (must be a nonzero integer)"),
  category: z.string().min(1, "Missing category"),
  item: z.string().min(1, "Missing item"),
  itemId: z.string().optional(),
  quantity: z.string().optional(),
  price: z.string().optional(),
});

export type RecordRequest = z.infer<typeof RecordRequestSchema>;

export const RecordEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  buyer: z.number().int(),
  count: z.number().int(),
  category: z.string(),
  item: z.string(),
  itemId: z.string(),
  quantity: z.string(),
  price: z.string(),
});

export type RecordEntry = z.infer<typeof RecordEntrySchema>;

export const RecordRowSchema = z.object({
  timestamp: z.string(),
  buyer: z.number().int(),
  count: z.number().int(),
  category: z.string(),
  item: z.string(),
  itemId: z.string(),
  quantity: z.string(),
  price: z.string(),
});

export type RecordRow = z.infer<typeof RecordRowSchema>;

export const RecordResponseSchema = z.object({
  ok: z.boolean().optional(),
  error: z.string().optional(),
});

export type RecordResponse = z.infer<typeof RecordResponseSchema>;

export const OverviewResponseSchema = z.object({
  records: z.array(RecordRowSchema),
});

export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;

export const ItemCountResponseSchema = z.object({
  count: z.number().int(),
});

export type ItemCountResponse = z.infer<typeof ItemCountResponseSchema>;

// ── Settings schemas ────────────────────────────────────────────────

export const KioskSettingsSchema = z.object({
  idleDimMs: z.number(),
  inactivityTimeoutMs: z.number(),
  maintenance: z.boolean(),
  locale: z.string(),
  currency: z.string(),
  buyerNoun: z.string(),
});

export type KioskSettings = z.infer<typeof KioskSettingsSchema>;

export const KioskSettingsUpdateSchema = z
  .object({
    idleDimMs: z.number().optional(),
    inactivityTimeoutMs: z.number().optional(),
    maintenance: z.boolean().optional(),
    locale: z.string().optional(),
    currency: z.string().optional(),
    buyerNoun: z.string().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "At least one setting required");

// ── Preorder config schemas ─────────────────────────────────────────

export const PreorderConfigSchema = z.object({
  orderingDays: z.array(z.boolean()).length(7),
  deliveryDays: z.array(z.boolean()).length(7),
});

export type PreorderConfig = z.infer<typeof PreorderConfigSchema>;

export const PreorderConfigUpdateSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  ordering: z.boolean(),
  delivery: z.boolean(),
});

// ── Admin catalog schemas ───────────────────────────────────────────

export const AdminCategoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Invalid name"),
  preorder: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

export const AdminCategoryUpdateSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1, "Invalid name"),
  preorder: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

export const AdminCategoryDeleteSchema = z.object({
  id: z.number().int(),
});

export const AdminItemCreateSchema = z.object({
  categoryId: z.number().int(),
  name: z.string().trim().min(1, "Invalid name"),
  quantity: z.string().optional().default(""),
  price: z.string().optional().default(""),
  dphRate: z.string().optional().default(""),
  sortOrder: z.number().int().optional().default(0),
});

export const AdminItemUpdateSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1, "Invalid name"),
  quantity: z.string().optional().default(""),
  price: z.string().optional().default(""),
  dphRate: z.string().optional().default(""),
  sortOrder: z.number().int().optional().default(0),
});

export const AdminItemDeleteSchema = z.object({
  id: z.number().int(),
});

// ── Admin buyer schemas ─────────────────────────────────────────────

export const AdminBuyerCreateSchema = z.object({
  id: z.number().int().min(1, "Invalid id"),
  label: z.string().trim().min(1, "Invalid label"),
});

export const AdminBuyerUpdateSchema = z.object({
  id: z.number().int().min(1, "Invalid id"),
  label: z.string().trim().min(1, "Invalid label"),
});

export const AdminBuyerDeleteSchema = z.object({
  id: z.number().int().min(1, "Invalid id"),
});

// ── Report schemas ──────────────────────────────────────────────────

export const ConsumptionRowSchema = z.object({
  item: z.string(),
  itemId: z.string(),
  category: z.string(),
  quantity: z.string(),
  price: z.string(),
  byBuyer: z.record(z.string(), z.number()),
});

export const ConsumptionReportSchema = z.object({
  rows: z.array(ConsumptionRowSchema),
});

export const PreorderReportRowSchema = z.object({
  date: z.string(),
  items: z.record(z.string(), z.number()),
});

export const PreorderReportSchema = z.object({
  rows: z.array(PreorderReportRowSchema),
});

// ── Item count input schema ─────────────────────────────────────────

export const ItemCountInputSchema = z.object({
  buyer: z.number().int().min(1),
  item: z.string().min(1),
  itemId: z.string().optional(),
});
