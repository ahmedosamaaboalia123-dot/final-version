import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();

export const createDelegateBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    maxActiveOrders: z.number().int().min(1).max(50).optional()
  })
  .strict();

export const updateDelegateBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    maxActiveOrders: z.number().int().min(1).max(50).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    expectedVersion: version
  })
  .strict()
  .refine((v) => v.status !== 'INACTIVE' || v.reason, {
    message: 'إيقاف المندوب يتطلب سببًا',
    path: ['reason']
  });

export const screenQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();

export const detailQuery = z.object({ include: z.string().max(100).optional() }).strict();

export const assignBody = z
  .object({
    delegateId: id,
    expectedOrderVersion: version
  })
  .strict();

export const assignmentActionBody = z.object({ expectedVersion: version }).strict();

export const reassignBody = z
  .object({
    delegateId: id,
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();

export const failBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();

export const overrideBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();
