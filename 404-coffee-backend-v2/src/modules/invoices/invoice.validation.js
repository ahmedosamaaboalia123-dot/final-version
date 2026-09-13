import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
export const idParams = z.object({ id }).strict();
export const invoiceListQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    channel: z.enum(['ADMIN', 'CUSTOMER_WEB', 'TABLE']).optional(),
    status: z.enum(['FINAL', 'CANCELLED']).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    search: z.string().trim().max(100).optional()
  })
  .strict();
