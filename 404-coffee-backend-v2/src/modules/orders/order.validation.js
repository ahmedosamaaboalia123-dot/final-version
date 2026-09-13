import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const money = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  .refine((v) => Number(v) > 0);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();
export const itemIdParams = z.object({ id, itemId: id }).strict();
export const readyItemParams = z.object({ itemId: id }).strict();

const orderInputItem = z
  .object({
    productId: id,
    productSizeId: id,
    quantity: z.number().int().min(1).max(100),
    addonIds: z.array(id).max(20).optional(),
    notes: z.string().trim().max(500).optional()
  })
  .strict();

const customer = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    address: z.string().trim().max(500).optional()
  })
  .strict();

export const confirmBody = z
  .object({
    fulfillmentType: z.enum(['TAKEAWAY', 'DELIVERY', 'DINE_IN']),
    customer,
    items: z.array(orderInputItem).min(1).max(50),
    tableSessionId: id.optional()
  })
  .strict()
  .refine((v) => v.fulfillmentType !== 'DINE_IN' || v.tableSessionId, {
    message: 'طلب الصالة يتطلب جلسة طاولة نشطة',
    path: ['tableSessionId']
  });

export const appendBody = z
  .object({
    items: z.array(orderInputItem).min(1).max(50),
    expectedVersion: version
  })
  .strict();

export const cancelItemBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedOrderVersion: version,
    expectedItemVersion: version
  })
  .strict();

export const cancelOrderBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();

export const readyBody = z
  .object({
    expectedItemVersion: version,
    expectedOrderVersion: version
  })
  .strict();

export const completeTakeawayBody = z
  .object({
    payment: z
      .object({ method: z.literal('CASH'), amount: money })
      .strict()
      .optional(),
    expectedVersion: version
  })
  .strict();

export const screenQuery = z
  .object({
    tab: z.enum(['active', 'completed', 'cancelled']).default('active'),
    fulfillmentType: z.enum(['TAKEAWAY', 'DELIVERY', 'DINE_IN']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();

export const detailQuery = z
  .object({
    include: z.string().max(100).optional()
  })
  .strict();
export const historyQuery = z
  .object({
    group: z.enum(['online', 'tables']).default('online'),
    status: z.string().trim().max(40).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
