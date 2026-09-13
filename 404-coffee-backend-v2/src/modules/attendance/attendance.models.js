import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    attendanceDate: { type: String, required: true },
    scheduleSnapshot: {
      workStart: { type: String, required: true },
      workEnd: { type: String, required: true },
      crossesMidnight: { type: Boolean, required: true },
      timezone: { type: String, required: true },
      graceMinutes: { type: Number, required: true }
    },
    checkInAt: { type: Date, required: true },
    checkInDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeDevice' },
    checkInSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthSession' },
    checkOutAt: Date,
    checkedOutBy: mongoose.Schema.Types.ObjectId,
    checkOutMethod: { type: String, enum: ['ADMIN', 'FORCE', 'ADJUSTMENT'] },
    lateMinutes: { type: Number, min: 0, default: 0 },
    workedMinutes: { type: Number, min: 0 },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    notes: String
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
attendanceSchema.index({ employeeId: 1, attendanceDate: -1, _id: -1 });
attendanceSchema.index(
  { employeeId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } }
);
attendanceSchema.index({ status: 1, checkInAt: -1, _id: -1 });

const adjustmentSchema = new mongoose.Schema(
  {
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceRecord', required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    oldValuesSafe: { type: mongoose.Schema.Types.Mixed, required: true },
    newValuesSafe: { type: mongoose.Schema.Types.Mixed, required: true },
    kind: { type: String, enum: ['CHECK_IN', 'CHECK_OUT', 'BOTH', 'FORCE_CLOSE'], required: true },
    reason: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
adjustmentSchema.index({ attendanceId: 1, createdAt: -1, _id: -1 });
for (const hook of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
])
  adjustmentSchema.pre(hook, () => {
    throw new Error('ATTENDANCE_ADJUSTMENT_IMMUTABLE');
  });

export const AttendanceRecord =
  mongoose.models.AttendanceRecord ?? mongoose.model('AttendanceRecord', attendanceSchema);
export const AttendanceAdjustment =
  mongoose.models.AttendanceAdjustment ?? mongoose.model('AttendanceAdjustment', adjustmentSchema);
