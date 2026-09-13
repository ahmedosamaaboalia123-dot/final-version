import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const attendanceIdParams = z.object({ id: objectId }).strict();
export const attendanceQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    employeeId: objectId.optional(),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional()
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be before to',
    path: ['from']
  });
export const checkInBody = z.object({}).strict();
export const checkOutBody = z
  .object({
    notes: z.string().trim().max(500).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const adjustmentBody = z
  .object({
    kind: z.enum(['CHECK_IN', 'CHECK_OUT', 'BOTH']),
    changes: z
      .object({
        checkInAt: z.iso.datetime({ offset: true }).optional(),
        checkOutAt: z.iso.datetime({ offset: true }).nullable().optional()
      })
      .strict(),
    reason: z.string().trim().min(3).max(500),
    expectedVersion: z.number().int().min(0)
  })
  .strict()
  .refine((value) => Object.keys(value.changes).length > 0, {
    message: 'at least one change is required',
    path: ['changes']
  });
export const forceCloseBody = z
  .object({
    checkOutAt: z.iso.datetime({ offset: true }).optional(),
    reason: z.string().trim().min(3).max(500),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
