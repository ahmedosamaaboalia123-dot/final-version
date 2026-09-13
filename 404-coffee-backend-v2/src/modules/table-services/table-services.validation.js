import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();

export const serviceBody = z
  .object({
    type: z.enum([
      'CALL_WAITER',
      'WATER_REQUEST',
      'PARTY_SURPRISE',
      'BILL_REQUEST',
      'REPORT_PROBLEM'
    ]),
    details: z.string().trim().max(500).optional(),
    problemCategory: z.string().trim().max(100).optional(),
    requestedQuantity: z.number().int().min(1).max(100).optional()
  })
  .strict()
  .refine((v) => v.type !== 'REPORT_PROBLEM' || (v.details && v.details.length >= 3), {
    message: 'وصف المشكلة مطلوب',
    path: ['details']
  });

export const guestCancelBody = z
  .object({
    reason: z.string().trim().max(500).optional(),
    expectedVersion: version
  })
  .strict();

export const resolveBody = z
  .object({
    resolutionNote: z.string().trim().max(500).optional(),
    resultCode: z.literal('HANDLED'),
    expectedVersion: version
  })
  .strict();

export const screenQuery = z
  .object({
    tab: z.enum(['open', 'completed']).default('open'),
    type: z
      .enum(['CALL_WAITER', 'WATER_REQUEST', 'PARTY_SURPRISE', 'BILL_REQUEST', 'REPORT_PROBLEM'])
      .optional(),
    tableNumber: z.coerce.number().int().min(1).max(20).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
