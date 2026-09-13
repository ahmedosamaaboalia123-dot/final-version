import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);

export const idParams = z.object({ id }).strict();

export const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    unread: z.coerce.boolean().optional()
  })
  .strict();

export const readAllBody = z.object({ before: z.iso.datetime().optional() }).strict();
