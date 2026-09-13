import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const warningsQuery = z
  .object({
    type: z.enum(['LOW_STOCK', 'EXPIRING', 'EXPIRED', 'OPEN_SHIFT_LONG']).optional(),
    materialId: objectId.optional(),
    supplierId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
