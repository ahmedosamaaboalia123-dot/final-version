import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();

export const rotateQrBody = z.object({ expectedVersion: version }).strict();

const orderInputItem = z
  .object({
    productId: id,
    productSizeId: id,
    quantity: z.number().int().min(1).max(100),
    addonIds: z.array(id).max(20).optional(),
    notes: z.string().trim().max(500).optional()
  })
  .strict();

export const adminOrderBody = z
  .object({
    items: z.array(orderInputItem).min(1).max(50),
    expectedTableVersion: version
  })
  .strict();

export const sessionItemsBody = z
  .object({
    items: z.array(orderInputItem).min(1).max(50),
    expectedSessionVersion: version,
    expectedOrderVersion: version
  })
  .strict();

export const cancelSessionBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();

export const closeSessionBody = z
  .object({
    payment: z
      .object({
        method: z.literal('CASH'),
        amount: z
          .string()
          .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
          .refine((v) => Number(v) > 0)
      })
      .strict()
      .optional(),
    expectedVersion: version
  })
  .strict();

export const tableStatusBody = z
  .object({
    outOfService: z.boolean(),
    reason: z.string().trim().min(3).max(500).optional(),
    expectedVersion: version
  })
  .strict()
  .refine((v) => v.outOfService !== true || v.reason, {
    message: 'إخراج الطاولة من الخدمة يتطلب سببًا',
    path: ['reason']
  });
