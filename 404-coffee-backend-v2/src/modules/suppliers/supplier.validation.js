import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const money = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0, 'amount must be positive');
export const supplierIdParams = z.object({ id: objectId }).strict();
export const suppliersQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
export const createSupplierBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    contactPerson: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(30),
    city: z.string().trim().min(2).max(100)
  })
  .strict();
export const updateSupplierBody = createSupplierBody
  .partial()
  .extend({ expectedVersion: z.number().int().min(0) })
  .strict();
export const deleteSupplierBody = z.object({ expectedVersion: z.number().int().min(0), reason: z.string().trim().min(3).max(500) }).strict();
export const createEntryBody = z
  .object({
    kind: z.enum(['DEBT', 'RECEIVABLE', 'DEBT_PAYMENT', 'RECEIVABLE_COLLECTION']),
    amount: money,
    occurredOn: z.iso.date(),
    notes: z.string().trim().max(500).optional(),
    expectedAccountVersion: z.number().int().min(0)
  })
  .strict();
export const entriesQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    kind: z
      .enum(['DEBT', 'RECEIVABLE', 'DEBT_PAYMENT', 'RECEIVABLE_COLLECTION', 'REVERSAL'])
      .optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional()
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['from'],
    message: 'from must be before to'
  });
export const reverseEntryBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
    expectedAccountVersion: z.number().int().min(0)
  })
  .strict();
export const updateEntryBody = z.object({ amount: money, occurredOn: z.iso.date(), notes: z.string().trim().max(500).optional(), reason: z.string().trim().min(3).max(500), expectedAccountVersion: z.number().int().min(0) }).strict();
export const deleteEntryBody = reverseEntryBody;
