import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const version = z.number().int().min(0);

export const publicListQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(3)
  })
  .strict();

export const idParams = z.object({ id }).strict();

export const submitBody = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    expectedOrderVersion: version
  })
  .strict();

export const updateBody = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000).nullable().optional(),
    expectedVersion: version
  })
  .strict()
  .refine((v) => v.rating !== undefined || v.comment !== undefined, {
    message: 'يجب تعديل التقييم أو التعليق',
    path: ['rating']
  });

export const moderationBody = z
  .object({
    status: z.enum(['VISIBLE', 'HIDDEN']),
    reason: z.string().trim().min(3).max(500),
    expectedVersion: version
  })
  .strict();

export const listQuery = z
  .object({
    status: z.enum(['VISIBLE', 'HIDDEN']).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
