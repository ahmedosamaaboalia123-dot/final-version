import {
  AttendanceAdjustment,
  AttendanceRecord
} from '../../modules/attendance/attendance.models.js';
import { AuditEvent } from '../audit/audit-event.model.js';
import { OutboxEvent } from '../events/outbox-event.model.js';
import { Sequence } from './sequence.model.js';
import { OperationRequest } from '../idempotency/operation-request.model.js';
import {
  AuthSession,
  Employee,
  EmployeeDevice,
  EmployeePageAccess,
  EmployeePermission,
  LoginAttempt,
  Permission,
  Role,
  RolePermission
} from '../../modules/employees/employee.models.js';
import {
  Supplier,
  SupplierAccount,
  SupplierAccountEntry
} from '../../modules/suppliers/supplier.models.js';
import {
  InventoryAllocation,
  InventoryMovement,
  MeasurementUnit,
  RawMaterial,
  RawMaterialBatch
} from '../../modules/inventory/inventory.models.js';
import {
  Product,
  ProductAddon,
  ProductCategory,
  ProductRecipe,
  ProductSize,
  ProductType
} from '../../modules/products/product.models.js';
import {
  PurchaseGroup,
  PurchaseItem,
  SupplierPurchaseInvoice
} from '../../modules/purchases/purchase.models.js';
import {
  PurchaseReturn,
  PurchaseReturnItem
} from '../../modules/purchase-returns/purchase-return.models.js';
import {
  CashDrawerShift,
  CashDrawerTransaction,
  DrawerShiftAlert
} from '../../modules/drawer/drawer.models.js';
import { CashRefund, OrderPayment } from '../../modules/payments/payment.models.js';
import { InvoiceSnapshot } from '../../modules/invoices/invoice.model.js';
import {
  Order,
  OrderItem,
  OrderItemStatusEvent,
  OrderStatusEvent
} from '../../modules/orders/order.models.js';
import { Customer } from '../../modules/customers/customer.models.js';
import { OrderReview, OrderReviewRevision } from '../../modules/reviews/review.models.js';
import {
  Delegate,
  DeliveryAssignment,
  DeliveryConfirmation
} from '../../modules/delivery/delivery.models.js';
import { Table, TableSession } from '../../modules/tables/tables.models.js';
import {
  TableGuestSession,
  TableOrderProposal
} from '../../modules/table-experience/table-experience.models.js';
import {
  TableServiceRequest,
  TableServiceStatusEvent
} from '../../modules/table-services/table-services.models.js';
import {
  CustomerAccessSession,
  CustomerOrderCredential,
  OrderCancellationRequest
} from '../../modules/customer-experience/customer-experience.models.js';
import { DashboardDaily } from '../../modules/dashboard/dashboard.models.js';
import { FinancialReportCache, ReportExport } from '../../modules/reports/reports.models.js';
import { Notification } from '../../modules/notifications/notifications.models.js';
import { Migration } from './migration.model.js';

const MODELS = [
  AttendanceAdjustment,
  AttendanceRecord,
  AuditEvent,
  OutboxEvent,
  Sequence,
  OperationRequest,
  AuthSession,
  Employee,
  EmployeeDevice,
  EmployeePermission,
  LoginAttempt,
  EmployeePageAccess,
  Permission,
  Role,
  RolePermission,
  Supplier,
  SupplierAccount,
  SupplierAccountEntry,
  MeasurementUnit,
  RawMaterial,
  RawMaterialBatch,
  InventoryMovement,
  InventoryAllocation,
  Product,
  ProductAddon,
  ProductCategory,
  ProductRecipe,
  ProductSize,
  ProductType,
  PurchaseGroup,
  PurchaseItem,
  SupplierPurchaseInvoice,
  PurchaseReturn,
  PurchaseReturnItem,
  CashDrawerShift,
  CashDrawerTransaction,
  DrawerShiftAlert,
  CashRefund,
  OrderPayment,
  InvoiceSnapshot,
  Order,
  OrderItem,
  OrderItemStatusEvent,
  OrderStatusEvent,
  Customer,
  OrderReview,
  OrderReviewRevision,
  Delegate,
  DeliveryAssignment,
  DeliveryConfirmation,
  Table,
  TableSession,
  TableGuestSession,
  TableOrderProposal,
  TableServiceRequest,
  TableServiceStatusEvent,
  CustomerAccessSession,
  CustomerOrderCredential,
  OrderCancellationRequest,
  DashboardDaily,
  FinancialReportCache,
  ReportExport,
  Notification,
  Migration
];

const OPTION_KEYS = ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression'];

export function readModelIndexes(models = MODELS) {
  const manifest = [];
  for (const model of models) {
    const collection = model.collection.name;
    for (const [keys, options] of model.schema.indexes()) {
      const picked = {};
      for (const key of OPTION_KEYS) if (options[key] !== undefined) picked[key] = options[key];
      manifest.push({ collection, keys, options: picked });
    }
  }
  return manifest.sort((a, b) =>
    a.collection === b.collection
      ? JSON.stringify(a.keys).localeCompare(JSON.stringify(b.keys))
      : a.collection.localeCompare(b.collection)
  );
}

export function modelCount() {
  return MODELS.length;
}
