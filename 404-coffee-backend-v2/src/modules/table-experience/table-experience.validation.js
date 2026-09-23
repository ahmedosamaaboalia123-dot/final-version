import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const idParams = z.object({ id }).strict();

export const emptyBody = z.object({}).strict();

const proposalInputItem = z
  .object({
    productId: id,
    productSizeId: id,
    quantity: z.number().int().min(1).max(100),
    addonIds: z.array(id).max(20).optional(),
    notes: z.string().trim().max(500).optional()
  })
  .strict();

export const bootstrapBody = z
  .object({
    tableNumber: z.number().int().min(1).max(20)
  })
  .strict();

export const proposalBody = z
  .object({
    items: z.array(proposalInputItem).min(1).max(50)
  })
  .strict();

export const reviewChangeBody = z
  .object({
    note: z.string().trim().max(500).optional(),
    expectedVersion: version
  })
  .strict();

export const confirmProposalBody = z
  .object({
    expectedVersion: version,
    expectedTableVersion: version,
    expectedOrderVersion: version.optional()
  })
  .strict();

export const guestReviewBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    expectedOrderVersion: version
  })
  .strict();

export const proposalScreenQuery = z
  .object({
    status: z
      .enum([
        'WAITING_WAITER',
        'UNDER_REVIEW',
        'NEEDS_CHANGES',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED'
      ])
      .optional(),
    tableNumber: z.coerce.number().int().min(1).max(20).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
