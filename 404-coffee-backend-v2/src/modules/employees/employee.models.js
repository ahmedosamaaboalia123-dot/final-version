import mongoose from 'mongoose';

const options = { timestamps: true, versionKey: 'version', optimisticConcurrency: true };

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, unique: true },
    passwordPlainText: { type: String, required: true, select: false },
    position: { type: String, required: true, trim: true },
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    workStart: { type: String, required: true },
    workEnd: { type: String, required: true },
    crossesMidnight: { type: Boolean, default: false },
    timezone: { type: String, default: 'Africa/Cairo' },
    graceMinutes: { type: Number, min: 0, max: 180, default: 0 },
    permissionsVersion: { type: Number, default: 1 },
    lastLoginAt: Date,
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId,
    deactivatedAt: Date,
    deactivatedBy: mongoose.Schema.Types.ObjectId,
    deactivationReason: String
  },
  options
);
employeeSchema.index({ status: 1, name: 1, _id: 1 });

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    level: { type: Number, required: true, min: 0 },
    description: String,
    isSystem: { type: Boolean, default: false }
  },
  options
);

const permissionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    pageKey: { type: String, required: true },
    action: { type: String, required: true },
    label: { type: String, required: true }
  },
  { timestamps: true, versionKey: false }
);

const rolePermissionSchema = new mongoose.Schema(
  {
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    permissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Permission', required: true }
  },
  { timestamps: true, versionKey: false }
);
rolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

const employeePermissionSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    permissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Permission', required: true },
    effect: { type: String, enum: ['ALLOW', 'DENY'], required: true },
    grantedAt: { type: Date, default: Date.now },
    grantedBy: mongoose.Schema.Types.ObjectId,
    reason: String
  },
  { timestamps: true, versionKey: false }
);
employeePermissionSchema.index({ employeeId: 1, permissionId: 1 }, { unique: true });

const pageAccessSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    pageKey: { type: String, required: true },
    visible: { type: Boolean, required: true },
    updatedBy: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: false }
);
pageAccessSchema.index({ employeeId: 1, pageKey: 1 }, { unique: true });

const deviceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    fingerprint: { type: String, required: true, select: false },
    fingerprintHash: { type: String, required: true },
    name: String,
    browser: String,
    os: String,
    userAgentSummary: String,
    status: { type: String, enum: ['PENDING', 'APPROVED', 'BLOCKED'], default: 'PENDING' },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    lastLoginAt: Date,
    attemptCount: { type: Number, default: 1 },
    approvedAt: Date,
    approvedBy: mongoose.Schema.Types.ObjectId,
    blockedAt: Date,
    blockedBy: mongoose.Schema.Types.ObjectId,
    decisionReason: String
  },
  options
);
deviceSchema.index({ employeeId: 1, fingerprintHash: 1 }, { unique: true });
deviceSchema.index({ status: 1, createdAt: -1, _id: -1 });

const sessionSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeDevice', required: true },
    refreshTokenHash: { type: String, required: true, unique: true, select: false },
    permissionsVersion: { type: Number, required: true },
    issuedAt: { type: Date, default: Date.now },
    lastUsedAt: Date,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedBy: mongoose.Schema.Types.ObjectId,
    revokeReason: String,
    ip: String,
    userAgent: String
  },
  { timestamps: true, versionKey: false }
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ employeeId: 1, revokedAt: 1 });
sessionSchema.index({ deviceId: 1, revokedAt: 1 });

const loginAttemptSchema = new mongoose.Schema(
  {
    employeeId: mongoose.Schema.Types.ObjectId,
    normalizedLoginName: { type: String, required: true },
    deviceId: mongoose.Schema.Types.ObjectId,
    fingerprintHash: String,
    result: { type: String, required: true },
    ip: String,
    occurredAt: { type: Date, default: Date.now },
    requestId: String
  },
  { timestamps: false, versionKey: false }
);
loginAttemptSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
loginAttemptSchema.index({ normalizedLoginName: 1, occurredAt: -1 });

export const Employee = mongoose.models.Employee ?? mongoose.model('Employee', employeeSchema);
export const Role = mongoose.models.Role ?? mongoose.model('Role', roleSchema);
export const Permission =
  mongoose.models.Permission ?? mongoose.model('Permission', permissionSchema);
export const RolePermission =
  mongoose.models.RolePermission ?? mongoose.model('RolePermission', rolePermissionSchema);
export const EmployeePermission =
  mongoose.models.EmployeePermission ??
  mongoose.model('EmployeePermission', employeePermissionSchema);
export const EmployeePageAccess =
  mongoose.models.EmployeePageAccess ?? mongoose.model('EmployeePageAccess', pageAccessSchema);
export const EmployeeDevice =
  mongoose.models.EmployeeDevice ?? mongoose.model('EmployeeDevice', deviceSchema);
export const AuthSession =
  mongoose.models.AuthSession ?? mongoose.model('AuthSession', sessionSchema);
export const LoginAttempt =
  mongoose.models.LoginAttempt ?? mongoose.model('LoginAttempt', loginAttemptSchema);
