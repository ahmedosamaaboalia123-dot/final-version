import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const employeeIdParams = z.object({ id: objectId }).strict();
export const employeesQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
export const employeeDetailsQuery = z
  .object({
    include: z
      .string()
      .optional()
      .transform((value, ctx) => {
        const values = value ? [...new Set(value.split(',').filter(Boolean))] : [];
        const allowed = new Set(['password', 'devices', 'attendance', 'permissions', 'activity']);
        if (values.length > 5 || values.some((item) => !allowed.has(item))) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid employee include list' });
          return z.NEVER;
        }
        return values;
      }),
    activityPage: z.coerce.number().int().min(1).default(1).optional(),
    activityLimit: z.coerce.number().int().min(1).max(10).default(10).optional(),
    attendancePage: z.coerce.number().int().min(1).default(1).optional(),
    attendanceLimit: z.coerce.number().int().min(1).max(10).default(10).optional()
  })
  .strict();
export const employeeDevicesQuery = z
  .object({
    employeeId: objectId.optional(),
    status: z.enum(['PENDING', 'APPROVED', 'BLOCKED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10)
  })
  .strict();
export const createEmployeeBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    passwordPlainText: z.string().min(1).max(128),
    position: z.string().trim().min(2).max(100),
    roleId: objectId,
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    workStart: time,
    workEnd: time,
    crossesMidnight: z.boolean().default(false),
    timezone: z.literal('Africa/Cairo').default('Africa/Cairo'),
    graceMinutes: z.number().int().min(0).max(180).default(0)
  })
  .strict();
export const updateEmployeeBody = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    passwordPlainText: z.string().min(1).max(128).optional(),
    position: z.string().trim().min(2).max(100).optional(),
    roleId: objectId.optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    schedule: z
      .object({
        workStart: time,
        workEnd: time,
        crossesMidnight: z.boolean(),
        timezone: z.literal('Africa/Cairo'),
        graceMinutes: z.number().int().min(0).max(180)
      })
      .strict()
      .optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const deleteEmployeeBody = z
  .object({ expectedVersion: z.number().int().min(0) })
  .strict();
export const deviceDecisionBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    expectedVersion: z.number().int().min(0)
  })
  .strict();
export const permissionMatrixBody = z
  .object({
    roleId: objectId,
    permissions: z
      .array(
        z.object({ permissionKey: z.string().min(3), effect: z.enum(['ALLOW', 'DENY']) }).strict()
      )
      .max(300),
    pages: z
      .array(z.object({ pageKey: z.string().min(2), visible: z.boolean() }).strict())
      .max(100),
    expectedPermissionsVersion: z.number().int().min(1)
  })
  .strict();
