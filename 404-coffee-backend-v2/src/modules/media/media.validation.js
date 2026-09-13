import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();

export const deleteBody = z.object({ expectedVersion: version }).strict();

export const listQuery = z
  .object({
    status: z.enum(['READY', 'QUARANTINED', 'DELETED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();

export const contentQuery = z
  .object({
    sig: z.string().min(10).max(200),
    exp: z.coerce.number().int().positive()
  })
  .strict();
