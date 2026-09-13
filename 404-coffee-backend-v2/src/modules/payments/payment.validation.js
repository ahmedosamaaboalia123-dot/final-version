import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const money = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  .refine((v) => Number(v) > 0);
export const idParams = z.object({ id }).strict();
export const collectBody = z
  .object({
    method: z.literal('CASH'),
    collectionMode: z.enum(['DIRECT', 'COD']),
    amount: money,
    expectedOrderVersion: z.number().int().min(0)
  })
  .strict();
export const refundBody = z
  .object({
    amount: money,
    reason: z.string().trim().min(3).max(500),
    expectedPaymentVersion: z.number().int().min(0)
  })
  .strict();
export const settleBody = z.object({ expectedPaymentVersion: z.number().int().min(0) }).strict();
export const completeRefundBody = z
  .object({ expectedRefundVersion: z.number().int().min(0) })
  .strict();
export const paymentListQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
