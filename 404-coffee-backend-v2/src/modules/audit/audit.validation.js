import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);

export const idParams = z.object({ id }).strict();

export const entityParams = z
  .object({
    entityType: z.string().trim().min(2).max(60),
    entityId: z.string().trim().min(1).max(100)
  })
  .strict();

export const screenQuery = z
  .object({
    module: z.string().trim().max(60).optional(),
    eventType: z.string().trim().max(120).optional(),
    actorId: z.string().trim().max(100).optional(),
    result: z.string().trim().max(30).optional(),
    severity: z.string().trim().max(30).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();

export const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();

export const exportBody = z
  .object({
    filters: z.record(z.string(), z.unknown()).optional(),
    format: z.enum(['PDF', 'XLSX', 'CSV'])
  })
  .strict();
