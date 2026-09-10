/**
 * config/roles.config.js
 * ======================
 * RBAC — نظام الصلاحيات بالدور
 * كل صفحة ليها ليستة actions، وكل دور (role) بياخد الصفحات والأفعال المسموحة.
 * الـ "OWNER" هو المتحكم المطلق — ولو محتاج تدي صلاحية لأي دور تاني
 * (زي الـ backup لمندوب معين)، عدّل المصفوفة دي بس وده كفاية.
 */

const ALL = "*";

const PAGES = {
  dashboard: [],
  users: [
    "view_users",
    "create_user",
    "edit_user",
    "change_user_status",
    "delete_user",
  ],
  sales: [
    "view_sales_history",
    "create_invoice",
    "edit_invoice",
    "cancel_invoice",
  ],
  purchases: [
    "view_purchases",
    "create_purchase",
    "edit_purchase",
    "approve_purchase",
    "cancel_purchase",
    "delete_purchase",
  ],
  customers: [
    "view_customers",
    "create_customer",
    "edit_customer",
    "delete_customer",
  ],
  inventory: [
    "view_inventory",
    "create_material",
    "edit_material",
    "delete_material",
    "add_batch",
  ],
  suppliers: [
    "view_suppliers",
    "create_supplier",
    "edit_supplier",
    "delete_supplier",
  ],
  products: [
    "view_products",
    "create_product",
    "edit_product",
    "delete_product",
    "manage_types",
    "manage_sizes",
    "manage_addons",
    "manage_ingredients",
  ],
  returns: [
    "view_returns",
    "create_return",
    "edit_return",
    "delete_return",
    "approve_return",
    "cancel_return",
  ],
  delegates: [
    "view_delegates",
    "create_delegate",
    "edit_delegate",
    "change_delegate_status",
    "delete_delegate",
  ],
  orders: [
    "view_orders",
    "create_order",
    "edit_order",
    "delete_order",
  ],
  cash_drawer_shifts: [
    "view_shifts_report",
    "open_shift",
    "close_shift",
    "record_cash_in",
    "record_cash_out",
  ],
  audit_log: ["view_audit_log"],
  settings: ["view_settings", "update_settings"],
  warnings: ["view_warnings"],
  financial_reports: [
    "view_sales_report",
    "view_profit_report",
    "view_treasury_report",
  ],
  backup: ["download_backup"],
};

const ALL_PAGES = Object.fromEntries(
  Object.keys(PAGES).map((page) => [page, ALL])
);

const ROLE_PERMISSIONS = {
  // المتحكم المطلق — كل حاجة
  OWNER: ALL_PAGES,

  // الإدارة التشغيلية — كل حاجة ما عدا: حذف موظف، النسخ الاحتياطي، تعديل الإعدادات
  MANAGER: {
    ...ALL_PAGES,
    users: [
      "view_users",
      "create_user",
      "edit_user",
      "change_user_status",
    ],
    settings: ["view_settings"],
    backup: [],
  },

  // الكاشير — المبيعات والطلبات والدرج
  CASHIER: {
    dashboard: ALL,
    sales: ALL,
    customers: ALL,
    orders: ["view_orders", "create_order", "edit_order"],
    returns: ["view_returns", "create_return"],
    cash_drawer_shifts: ALL,
    purchases: ["view_purchases"],
    inventory: ["view_inventory"],
    products: ["view_products"],
    suppliers: ["view_suppliers"],
    delegates: ["view_delegates"],
    warnings: ["view_warnings"],
  },

  // المندوب — الطلبات بس
  DELEGATE: {
    dashboard: ALL,
    orders: ["view_orders", "edit_order"],
    sales: ["view_sales_history"],
    warnings: ["view_warnings"],
    cash_drawer_shifts: ["view_shifts_report"],
  },
};

const isValidRole = (role) => Object.hasOwn(ROLE_PERMISSIONS, role);

const can = (role, page, action) => {
  if (!isValidRole(role)) return false;

  const actions = ROLE_PERMISSIONS[role][page];

  if (!actions) return false;
  if (actions === ALL) return true;
  if (!action) return true;

  return actions.includes(action);
};

/**
 * صلاحيات الدور بصورتها الملموسة — الـ "*" بتتوسع لقائمة الأفعال الفعلية
 * للصفحة، عشان الـ API يرجع بيانات جاهزة للاستهلاك مش رمز مجرد.
 */
const getExpandedPermissions = (role) => {
  if (!isValidRole(role)) return {};

  return Object.fromEntries(
    Object.keys(ROLE_PERMISSIONS[role]).map((page) => [
      page,
      ROLE_PERMISSIONS[role][page] === ALL
        ? PAGES[page]
        : ROLE_PERMISSIONS[role][page],
    ])
  );
};

module.exports = {
  ALL,
  PAGES,
  ROLE_PERMISSIONS,
  isValidRole,
  can,
  getExpandedPermissions,
};