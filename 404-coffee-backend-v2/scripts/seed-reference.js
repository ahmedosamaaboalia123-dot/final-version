import mongoose from 'mongoose';
import { loadEnv } from '../src/config/env.js';
import { AUTH_PERMISSIONS } from '../src/shared/constants/auth.constants.js';
import { MeasurementUnit } from '../src/modules/inventory/inventory.models.js';
import { Permission, Role } from '../src/modules/employees/employee.models.js';
import { ensureDefaultTables } from '../src/modules/tables/tables.public-service.js';

const UNITS = [
  { code: 'G', nameAr: 'جرام', kind: 'MASS', physicalFactor: '1' },
  { code: 'KG', nameAr: 'كيلوجرام', kind: 'MASS', physicalFactor: '1000' },
  { code: 'ML', nameAr: 'ملليلتر', kind: 'VOLUME', physicalFactor: '1' },
  { code: 'L', nameAr: 'لتر', kind: 'VOLUME', physicalFactor: '1000' },
  { code: 'PCS', nameAr: 'قطعة', kind: 'COUNT', physicalFactor: '1' }
];

const SCOPE_LABELS = {
  employees: 'الموظفين',
  'employees.password': 'كلمات مرور الموظفين',
  'employees.devices': 'أجهزة الموظفين',
  'employees.permissions': 'صلاحيات الموظفين',
  attendance: 'الحضور',
  suppliers: 'الموردين',
  'suppliers.account': 'حسابات الموردين',
  inventory: 'المخزون',
  warnings: 'التحذيرات',
  products: 'المنتجات',
  purchases: 'المشتريات',
  'purchase-returns': 'مرتجعات المشتريات',
  drawer: 'الدرج',
  payments: 'المدفوعات',
  invoices: 'الفواتير',
  orders: 'الطلبات',
  preparation: 'التحضير',
  customers: 'العملاء',
  reviews: 'التقييمات',
  delegates: 'المناديب',
  delivery: 'التوصيل',
  tables: 'الطاولات',
  'table-proposals': 'مقترحات الطاولات',
  'table-services': 'خدمات الطاولات',
  'order-cases': 'حالات الطلبات',
  dashboard: 'لوحة القيادة',
  reports: 'التقارير',
  audit: 'التدقيق',
  notifications: 'الإشعارات',
  media: 'الوسائط'
};

const ACTION_LABELS = {
  read: 'عرض',
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  manage: 'إدارة',
  withdraw: 'سحب',
  priorities: 'أولويات',
  register: 'تسجيل',
  open: 'فتح',
  move: 'حركة',
  close: 'إغلاق',
  collect: 'تحصيل',
  refund: 'رد',
  settle: 'تسوية',
  print: 'طباعة',
  cancel: 'إلغاء',
  complete: 'إتمام',
  review: 'مراجعة',
  submit: 'تقديم',
  moderate: 'إشراف',
  decide: 'اعتماد',
  adjust: 'تصحيح',
  'check-out': 'انصراف',
  'force-close': 'إغلاق قسري',
  reverse: 'عكس',
  write: 'قيد',
  export: 'تصدير',
  upload: 'رفع',
  view: 'عرض'
};

export function permissionLabel(key) {
  const parts = key.split('.');
  const action = parts[parts.length - 1];
  const scope = parts.slice(0, -1).join('.');
  const scopeAr = SCOPE_LABELS[scope];
  const actionAr = ACTION_LABELS[action];
  if (!scopeAr || !actionAr) return key;
  return `${actionAr} ${scopeAr}`;
}

export async function seedReferenceData(context = {}) {
  const models = context.models ?? { MeasurementUnit, Permission, Role };
  const summary = { units: 0, permissions: 0, roles: 0, tables: 0 };
  if (models.MeasurementUnit) {
    const operations = UNITS.map((unit) => ({
      updateOne: {
        filter: { code: unit.code },
        update: { $setOnInsert: unit },
        upsert: true
      }
    }));
    const result = await models.MeasurementUnit.bulkWrite(operations, { ordered: false });
    summary.units = result.upsertedCount ?? 0;
  }
  if (models.Permission) {
    const operations = Object.values(AUTH_PERMISSIONS).map((key) => {
      const parts = key.split('.');
      return {
        updateOne: {
          filter: { key },
          update: {
            $setOnInsert: {
              key,
              pageKey: parts.slice(0, -1).join('.'),
              action: parts[parts.length - 1],
              label: permissionLabel(key)
            }
          },
          upsert: true
        }
      };
    });
    const result = await models.Permission.bulkWrite(operations, { ordered: false });
    summary.permissions = result.upsertedCount ?? 0;
  }
  if (models.Role) {
    const result = await models.Role.bulkWrite(
      [
        { updateOne: { filter: { name: 'Admin' }, update: { $setOnInsert: { name: 'Admin', level: 100, description: 'مدير النظام', isSystem: true } }, upsert: true } },
        { updateOne: { filter: { name: 'Employee' }, update: { $setOnInsert: { name: 'Employee', level: 10, description: 'موظف', isSystem: true } }, upsert: true } }
      ],
      { ordered: false }
    );
    summary.roles = result.upsertedCount ?? 0;
  }
  if (context.seedTables !== false) {
    const tables = await ensureDefaultTables(context);
    summary.tables = tables.created;
  }
  return summary;
}

async function main() {
  const config = loadEnv();
  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: config.mongo.connectTimeoutMs
  });
  try {
    const summary = await seedReferenceData({});
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

const invoked = process.argv[1]?.endsWith('seed-reference.js') ?? false;
if (invoked) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
}
