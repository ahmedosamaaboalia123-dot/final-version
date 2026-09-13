import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);
const positive = decimal.refine((v) => Number(v) > 0);
const items = z
  .array(z.object({ materialId: id, quantityLarge: positive, largeUnitPrice: positive }).strict())
  .min(1)
  .max(100);
export const idParams = z.object({ id }).strict();
export const createGroupBody = z.object({ items, invoiceDate: z.iso.date().optional() }).strict();
export const updateGroupBody = z
  .object({ items, invoiceDate: z.iso.date().optional(), expectedVersion: z.number().int().min(0) })
  .strict();
export const deleteGroupBody = z.object({ expectedVersion: z.number().int().min(0) }).strict();
export const splitBody = z.object({ expectedVersion: z.number().int().min(0) }).strict();
export const registerItemBody = z
  .object({
    receivedOn: z.iso.date(),
    expiryOn: z.iso.date().nullable().default(null),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const registerManyBody = z
  .object({
    expectedVersion: z.number().int().min(0),
    items: z
      .array(
        z
          .object({
            purchaseItemId: id,
            receivedOn: z.iso.date(),
            expiryOn: z.iso.date().nullable().default(null),
            expectedItemVersion: z.number().int().min(0)
          })
          .strict()
      )
      .min(1)
      .max(50)
  })
  .strict()
  .refine((v) => new Set(v.items.map((i) => i.purchaseItemId)).size === v.items.length, {
    path: ['items'],
    message: 'duplicate purchase item'
  });
export const screenQuery = z
  .object({
    tab: z.enum(['unregistered', 'registered', 'all']).default('unregistered'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
