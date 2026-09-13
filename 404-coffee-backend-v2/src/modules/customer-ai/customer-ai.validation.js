import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);

export const chatBody = z
  .object({
    conversationId: z.string().trim().min(1).max(100).optional(),
    message: z.string().trim().min(1).max(2000),
    context: z
      .object({
        visibleProductIds: z.array(id).max(50).optional(),
        cartSummary: z
          .array(
            z
              .object({
                productId: id,
                sizeId: id,
                quantity: z.number().int().min(1).max(100)
              })
              .strict()
          )
          .max(20)
          .optional()
      })
      .strict()
      .optional()
  })
  .strict();
