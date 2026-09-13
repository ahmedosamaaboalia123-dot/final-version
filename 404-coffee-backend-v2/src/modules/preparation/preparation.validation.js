import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);

export const idParams = z.object({ id }).strict();

export const screenQuery = z
  .object({
    group: z.enum(['online', 'tables']).default('online'),
    tab: z.enum(['current', 'ready']).default('current'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
