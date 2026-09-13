import { z } from 'zod';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);
const positive = decimal.refine((value) => Number(value) > 0, 'must be positive');
export const idParams = z.object({ id: objectId }).strict();
export const unitsQuery = z
  .object({
    kind: z.enum(['MASS', 'VOLUME', 'COUNT', 'CONTAINER']).optional(),
    active: z.enum(['true', 'false']).optional()
  })
  .strict();
export const materialsQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    supplierId: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
export const createMaterialBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    supplierId: objectId,
    largeUnitId: objectId,
    smallUnitId: objectId,
    conversionFactor: positive,
    smallQuantityStep: positive,
    referenceLargeUnitPrice: positive.optional(),
    currency: z.literal('EGP').default('EGP'),
    minStockSmall: decimal,
    expiryAlertDays: z.number().int().min(0).max(3650)
  })
  .strict();
export const updateMaterialBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    supplierId: objectId.optional(),
    largeUnitId: objectId.optional(),
    smallUnitId: objectId.optional(),
    conversionFactor: positive.optional(),
    smallQuantityStep: positive.optional(),
    referenceLargeUnitPrice: positive.optional(),
    minStockSmall: decimal.optional(),
    expiryAlertDays: z.number().int().min(0).max(3650).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const deleteMaterialBody = z.object({ expectedVersion: z.number().int().min(0), reason: z.string().trim().min(3).max(500) }).strict();
export const withdrawalBody = z
  .object({
    batchId: objectId,
    quantityLarge: positive,
    reason: z.string().trim().min(3).max(500),
    occurredOn: z.iso.date(),
    expectedBatchVersion: z.number().int().min(0)
  })
  .strict();
export const prioritiesBody = z
  .object({
    expectedPriorityVersion: z.number().int().min(0),
    orderedBatchIds: z.array(objectId).min(1).max(100)
  })
  .strict()
  .refine((value) => new Set(value.orderedBatchIds).size === value.orderedBatchIds.length, {
    path: ['orderedBatchIds'],
    message: 'duplicate batch ids'
  });
export const withdrawalsQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    materialId: objectId.optional(),
    supplierId: objectId.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional()
  })
  .strict();
