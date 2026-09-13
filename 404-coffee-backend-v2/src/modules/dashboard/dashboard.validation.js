import { z } from 'zod';

export const screenQuery = z
  .object({
    period: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
  })
  .strict();
