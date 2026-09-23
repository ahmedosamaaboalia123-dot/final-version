import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);
const orderNumber = z.string().trim().min(3).max(30);

export const orderNumberParams = z.object({ orderNumber }).strict();

const orderInputItem = z
  .object({
    productId: id,
    productSizeId: id,
    quantity: z.number().int().min(1).max(100),
    addonIds: z.array(id).max(20).optional(),
    notes: z.string().trim().max(500).optional()
  })
  .strict();

export const checkoutBody = z
  .object({
    fulfillmentType: z.enum(['TAKEAWAY', 'DELIVERY']),
    customer: z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z.string().trim().min(7).max(30),
        address: z.string().trim().max(500).optional()
      })
      .strict(),
    items: z.array(orderInputItem).min(1).max(50)
  })
  .strict();

export const lookupBody = z
  .object({
    orderNumber,
    phone: z.string().trim().min(7).max(30)
  })
  .strict();

export const publicAppendBody = z
  .object({
    items: z.array(orderInputItem).min(1).max(50),
    expectedVersion: version
  })
  .strict();

export const cancellationBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();

export const receiveBody = z.object({ expectedVersion: version }).strict();

export const publicReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    expectedOrderVersion: version
  })
  .strict();

export const accessSessionBody = z
  .object({
    orderNumber,
    orderActionToken: z.string().min(20).max(200)
  })
  .strict();

export const historyQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
