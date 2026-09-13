import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    { message: 'التاريخ غير صحيح' }
  );

export const idParams = z.object({ id }).strict();

export const screenQuery = z
  .object({
    from: businessDate.optional(),
    to: businessDate.optional(),
    compare: z.enum(['previous_period', 'none']).default('previous_period')
  })
  .strict();

export const rangeQuery = z
  .object({
    from: businessDate.optional(),
    to: businessDate.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();

export const salesQuery = rangeQuery
  .extend({ channel: z.enum(['ADMIN', 'CUSTOMER_WEB', 'TABLE']).optional() })
  .strict();

export const suppliersQuery = rangeQuery.extend({ supplierId: id.optional() }).strict();

export const delegatesQuery = rangeQuery.extend({ delegateId: id.optional() }).strict();

export const exportBody = z
  .object({
    reportType: z.enum(['sales', 'inventory', 'drawer', 'suppliers', 'delegates', 'audit:events']),
    from: businessDate.optional(),
    to: businessDate.optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
    format: z.enum(['PDF', 'XLSX', 'CSV'])
  })
  .strict();
