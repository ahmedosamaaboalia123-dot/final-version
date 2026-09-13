import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const roleIdParams = z.object({ id: objectId }).strict();
export const createRoleBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    level: z.number().int().min(0).max(1000),
    description: z.string().max(500).optional(),
    permissionKeys: z.array(z.string().min(3)).max(300).default([])
  })
  .strict();
export const updateRoleBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    level: z.number().int().min(0).max(1000).optional(),
    description: z.string().max(500).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const rolePermissionsBody = z
  .object({
    permissionKeys: z.array(z.string().min(3)).max(300),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
