import { z } from 'zod';

export const loginBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    password: z.string().min(1).max(128),
    fingerprint: z.string().min(8).max(512),
    device: z
      .object({
        name: z.string().max(100).optional(),
        browser: z.string().max(100).optional(),
        os: z.string().max(100).optional()
      })
      .strict()
  })
  .strict();
export const refreshBody = z.object({ refreshToken: z.string().min(32).max(256) }).strict();
export const logoutBody = z
  .object({ refreshToken: z.string().min(32).max(256), allSessions: z.boolean().default(false) })
  .strict();
