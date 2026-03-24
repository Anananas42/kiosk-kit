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
