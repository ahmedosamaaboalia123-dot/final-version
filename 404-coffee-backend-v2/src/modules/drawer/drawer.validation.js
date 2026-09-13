import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i),
  money = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/);
export const idParams = z.object({ id }).strict();
export const openBody = z
  .object({ openingBalance: money, notes: z.string().trim().max(500).optional() })
  .strict();
export const movementBody = z
  .object({
    amount: money.refine((v) => Number(v) > 0),
    accountingClass: z.string().trim().min(2).max(80),
    description: z.string().trim().min(2).max(500),
    reason: z.string().trim().min(2).max(500),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const closeBody = z
  .object({
    actualClosingBalance: money,
    closingNotes: z.string().trim().max(500).optional(),
    differenceReason: z.string().trim().max(500).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const reverseBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedShiftVersion: z.number().int().min(0)
  })
  .strict();
export const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    status: z.enum(['OPEN', 'CLOSING', 'CLOSED']).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional()
  })
  .strict();
