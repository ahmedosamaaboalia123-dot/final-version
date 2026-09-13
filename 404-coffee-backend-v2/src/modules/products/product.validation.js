import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const money = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  .refine((v) => Number(v) >= 0);
const quantity = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/)
  .refine((v) => Number(v) > 0);
export const idParams = z.object({ id }).strict();
export const createCategoryBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).default(0)
  })
  .strict();
export const updateCategoryBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const createProductBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    imageId: id.optional(),
    categoryId: id,
    isVisibleInMenu: z.boolean().default(true),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
  })
  .strict();
export const updateProductBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    imageId: id.nullable().optional(),
    categoryId: id.optional(),
    isVisibleInMenu: z.boolean().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const createTypeBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    allowedMaterialIds: z.array(id).max(100).default([]),
    sortOrder: z.number().int().min(0).default(0)
  })
  .strict();
export const createSizeBody = z
  .object({
    typeId: id,
    name: z.string().trim().min(1).max(100),
    sellingPrice: money,
    sortOrder: z.number().int().min(0).default(0)
  })
  .strict();
export const recipeBody = z
  .object({
    ingredients: z
      .array(z.object({ materialId: id, quantitySmall: quantity }).strict())
      .min(1)
      .max(100),
    expectedVersion: z.number().int().min(0).optional()
  })
  .strict();
export const addonBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    sellingPrice: money,
    notes: z.string().trim().max(500).optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).default(0)
  })
  .strict();
export const updateAddonBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    sellingPrice: money.optional(),
    notes: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const productsQuery = z
  .object({
    categoryId: id.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    visible: z.enum(['true', 'false']).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
export const catalogQuery = z
  .object({
    categoryId: id.optional(),
    typeId: id.optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
