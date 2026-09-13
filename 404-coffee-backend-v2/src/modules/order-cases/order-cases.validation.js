import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();

export const emptyBody = z.object({}).strict();

export const decisionBody = z.object({ expectedVersion: version }).strict();

export const rejectBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();

export const retryBody = z.object({ expectedRefundVersion: version }).strict();

export const listQuery = z
  .object({
    status: z.enum(['PENDING', 'AUTO_APPROVED', 'EXECUTED', 'REJECTED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
