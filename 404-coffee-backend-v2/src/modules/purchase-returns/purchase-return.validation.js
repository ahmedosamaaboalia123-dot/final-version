import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const positive = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .refine((v) => Number(v) > 0);
export const idParams = z.object({ id }).strict();
export const createReturnBody = z
  .object({
    returnDate: z.iso.date(),
    notes: z.string().trim().max(1000).optional(),
    items: z
      .array(
        z
          .object({
            batchId: id,
            quantityLarge: positive,
            reason: z.string().trim().min(3).max(500),
            expectedBatchVersion: z.number().int().min(0)
          })
          .strict()
      )
      .min(1)
      .max(50)
  })
  .strict()
  .refine((v) => new Set(v.items.map((i) => i.batchId)).size === v.items.length, {
    path: ['items'],
    message: 'duplicate batch'
  });
export const returnsQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    supplierId: id.optional()
  })
  .strict();
