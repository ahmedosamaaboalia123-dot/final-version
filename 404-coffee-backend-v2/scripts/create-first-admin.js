import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { normalizeName } from '../src/shared/utils/normalize-name.js';
import {
  Employee,
  EmployeeDevice,
  Permission,
  Role,
  RolePermission
} from '../src/modules/employees/employee.models.js';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const [key, value] = argv[index].split('=');
    if (key.startsWith('--')) args[key.slice(2)] = value ?? true;
  }
  return args;
}

export async function createFirstAdmin({ name, password, roleName = 'Admin' }, context = {}) {
  if (!name || !password)
    throw Object.assign(new Error('name and password are required (--name= --password=)'), {
      code: 'ADMIN_ARGS_MISSING'
    });
  const models = context.models ?? { Employee, Role, RolePermission, Permission, EmployeeDevice };
  const existingAdmin = await models.Employee.findOne({ roleId: { $ne: null }, status: 'ACTIVE' })
    .sort({ createdAt: 1 })
    .lean();
  if (existingAdmin) {
    const role = await models.Role.findById(existingAdmin.roleId).lean();
    if (role && role.name === roleName)
      throw Object.assign(
        new Error(`an active ${roleName} already exists; refusing to create another`),
        {
          code: 'ADMIN_ALREADY_EXISTS'
        }
      );
  }
  let role = await models.Role.findOne({ name: roleName });
  if (!role) {
    const [created] = await models.Role.create([
      { name: roleName, level: 100, description: 'مدير النظام', isSystem: true }
    ]);
    role = created;
  }
  const permissions = await models.Permission.find({}).select({ _id: 1 }).lean();
  if (permissions.length > 0)
    await models.RolePermission.bulkWrite(
      permissions.map((permission) => ({
        updateOne: {
          filter: { roleId: role._id, permissionId: permission._id },
          update: { $setOnInsert: { roleId: role._id, permissionId: permission._id } },
          upsert: true
        }
      })),
      { ordered: false }
    );
  const [employee] = await models.Employee.create([
    {
      name,
      normalizedName: normalizeName(name),
      passwordPlainText: password,
      position: 'مدير',
      roleId: role._id,
      workStart: '09:00',
      workEnd: '17:00'
    }
  ]);
  const fingerprint = 'initial-setup-device';
  await models.EmployeeDevice.findOneAndUpdate(
    {
      employeeId: employee._id,
      fingerprintHash: createHash('sha256').update(fingerprint).digest('hex')
    },
    {
      $setOnInsert: {
        employeeId: employee._id,
        fingerprint,
        fingerprintHash: createHash('sha256').update(fingerprint).digest('hex'),
        name: 'Initial setup device',
        status: 'APPROVED'
      }
    },
    { upsert: true, new: true }
  );
  return { employeeId: String(employee._id), roleId: String(role._id), roleName: role.name };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadEnv();
  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: config.mongo.connectTimeoutMs
  });
  try {
    const result = await createFirstAdmin(
      { name: args.name, password: args.password, roleName: args.role ?? 'Admin' },
      {}
    );
    console.log(JSON.stringify({ ...result, password: '[NOT-ECHOED]' }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

const invoked = process.argv[1]?.endsWith('create-first-admin.js') ?? false;
if (invoked) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
}
