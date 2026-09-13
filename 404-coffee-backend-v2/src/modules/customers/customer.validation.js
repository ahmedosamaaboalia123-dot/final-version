import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();

export const createBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    address: z.string().trim().max(500).optional(),
    socialLinks: z.array(z.string().trim().max(200)).max(10).optional()
  })
  .strict();

export const updateBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    address: z.string().trim().max(500).nullable().optional(),
    socialLinks: z.array(z.string().trim().max(200)).max(10).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'BLOCKED']).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    expectedVersion: version
  })
  .strict()
  .refine((v) => v.status !== 'BLOCKED' || v.reason, {
    message: 'حظر العميل يتطلب سببًا',
    path: ['reason']
  });

export const screenQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'BLOCKED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();

export const detailQuery = z.object({ include: z.string().max(100).optional() }).strict();

export const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
