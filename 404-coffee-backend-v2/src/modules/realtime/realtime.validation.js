import { z } from 'zod';

export const syncQuery = z
  .object({
    rooms: z.string().trim().min(1).max(500),
    afterSequence: z.coerce.number().min(0).default(0)
  })
  .strict();
