import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createAttendanceController } from './attendance.controller.js';
import {
  adjustmentBody,
  attendanceIdParams,
  attendanceQuery,
  checkInBody,
  checkOutBody,
  forceCloseBody
} from './attendance.validation.js';

export function createAttendanceRouter(dependencies) {
  const router = Router();
  const controller = createAttendanceController(dependencies);
  router.use(employeeAuth(dependencies.config, dependencies.authDependencies));
  router.post(
    '/attendance/check-in',
    validate({ body: checkInBody }),
    asyncHandler(controller.checkIn)
  );
  router.get(
    '/attendance',
    requirePermission(AUTH_PERMISSIONS.ATTENDANCE_READ),
    validate({ query: attendanceQuery }),
    asyncHandler(controller.list)
  );
  router.get(
    '/attendance/:id',
    requirePermission(AUTH_PERMISSIONS.ATTENDANCE_READ),
    validate({ params: attendanceIdParams }),
    asyncHandler(controller.details)
  );
  router.post(
    '/attendance/:id/check-out',
    requirePermission(AUTH_PERMISSIONS.ATTENDANCE_CHECK_OUT),
    validate({ params: attendanceIdParams, body: checkOutBody }),
    asyncHandler(controller.checkOut)
  );
  router.post(
    '/attendance/:id/adjustments',
    requirePermission(AUTH_PERMISSIONS.ATTENDANCE_ADJUST),
    validate({ params: attendanceIdParams, body: adjustmentBody }),
    asyncHandler(controller.adjust)
  );
  router.post(
    '/attendance/:id/force-close',
    requirePermission(AUTH_PERMISSIONS.ATTENDANCE_FORCE_CLOSE),
    validate({ params: attendanceIdParams, body: forceCloseBody }),
    asyncHandler(controller.forceClose)
  );
  return router;
}
