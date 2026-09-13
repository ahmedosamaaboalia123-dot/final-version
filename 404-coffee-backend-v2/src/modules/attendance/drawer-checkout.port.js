import { ApiError } from '../../platform/http/api-error.js';

export async function assertEmployeeHasNoOpenDrawer(employeeId, context = {}) {
  if (typeof context.drawerPort?.hasOpenShiftForEmployee !== 'function')
    throw new ApiError({
      code: 'DRAWER_GUARD_UNAVAILABLE',
      status: 503,
      messageAr: 'فحص الدرج غير متاح حاليًا',
      retryable: true
    });
  if (await context.drawerPort.hasOpenShiftForEmployee(employeeId, context))
    throw new ApiError({
      code: 'EMPLOYEE_HAS_OPEN_DRAWER',
      status: 409,
      messageAr: 'لا يمكن تسجيل الانصراف قبل إغلاق درج الموظف'
    });
}
