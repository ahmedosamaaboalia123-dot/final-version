import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { toAdjustmentDto, toAttendanceDto } from './attendance.mapper.js';
import { getAttendanceDetails, listAttendance } from './attendance.queries.js';
import {
  adminCheckOut,
  checkIn,
  createAttendanceAdjustment,
  forceCloseAttendance
} from './attendance.service.js';

const contextFrom = (req, dependencies) => ({
  ...req.auth,
  ...dependencies.serviceContext,
  deviceId: req.auth.deviceId,
  authSessionId: req.auth.sessionId
});
export function createAttendanceController(dependencies) {
  return {
    checkIn: async (req, res) => {
      const result = await checkIn(req.auth.actorId, contextFrom(req, dependencies));
      const payload = {
        attendance: toAttendanceDto(result.attendance),
        alreadyOpen: result.alreadyOpen
      };
      return result.alreadyOpen ? sendSuccess(res, payload) : sendCreated(res, payload);
    },
    checkOut: async (req, res) => {
      const result = await adminCheckOut(
        req.validated.params.id,
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendSuccess(res, { attendance: toAttendanceDto(result.attendance) });
    },
    forceClose: async (req, res) => {
      const result = await forceCloseAttendance(
        req.validated.params.id,
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendSuccess(res, {
        attendance: toAttendanceDto(result.attendance),
        adjustment: toAdjustmentDto(result.adjustment)
      });
    },
    adjust: async (req, res) => {
      const result = await createAttendanceAdjustment(
        req.validated.params.id,
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendCreated(res, {
        attendance: toAttendanceDto(result.attendance),
        adjustment: toAdjustmentDto(result.adjustment)
      });
    },
    list: async (req, res) =>
      sendSuccess(res, await listAttendance(req.validated.query, contextFrom(req, dependencies))),
    details: async (req, res) =>
      sendSuccess(
        res,
        await getAttendanceDetails(req.validated.params.id, contextFrom(req, dependencies))
      )
  };
}
