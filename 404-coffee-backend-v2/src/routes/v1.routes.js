import { Router } from 'express';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { getAdminBootstrap } from '../modules/auth/admin-bootstrap.service.js';
import { createEmployeeRouter } from '../modules/employees/employee.routes.js';
import { createAttendanceRouter } from '../modules/attendance/attendance.routes.js';
import { createSupplierRouter } from '../modules/suppliers/supplier.routes.js';
import { createInventoryRouter } from '../modules/inventory/inventory.routes.js';
import { createWarningRouter } from '../modules/warnings/warning.routes.js';
import { getWarningsSummary } from '../modules/warnings/warning.public-service.js';
import { createCatalogRouter, createProductRouter } from '../modules/products/product.routes.js';
import { listProductsByMaterial } from '../modules/products/product.public-service.js';
import { createPurchaseRouter } from '../modules/purchases/purchase.routes.js';
import { createPurchaseReturnRouter } from '../modules/purchase-returns/purchase-return.routes.js';
import {
  createBatchFromPurchase,
  simulateRecipeRequirements,
  listMaterialsBySupplier,
  lockMaterialSupplierAndUnits
} from '../modules/inventory/inventory.public-service.js';
import { createDrawerRouter } from '../modules/drawer/drawer.routes.js';
import {
  createTableGuestRouter,
  createTableProposalRouter
} from '../modules/table-experience/table-experience.routes.js';
import {
  createTableServiceAdminRouter,
  createTableServiceGuestRouter
} from '../modules/table-services/table-services.routes.js';
import { createOrderCasesRouter } from '../modules/order-cases/order-cases.routes.js';
import { createMediaRouter } from '../modules/media/media.routes.js';
import { assertReadyAsset } from '../modules/media/media.public-service.js';
import { createCustomerAiRouter } from '../modules/customer-ai/customer-ai.routes.js';
import { createDashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { createReportsRouter } from '../modules/reports/reports.routes.js';
import { createAuditRouter } from '../modules/audit/audit.routes.js';
import { createNotificationsRouter } from '../modules/notifications/notifications.routes.js';
import { createRealtimeRouter } from '../modules/realtime/realtime.routes.js';
import {
  closeCancelledAssignments,
  getAssignmentByOrder
} from '../modules/delivery/delivery.public-service.js';
import {
  closeSessionServices,
  createOrderReviewRequest,
  resolveProposalServices
} from '../modules/table-services/table-services.public-service.js';
import { createTablesRouter } from '../modules/tables/tables.routes.js';
import { closeSessionForOrder } from '../modules/tables/tables.public-service.js';
import { createDeliveryRouter } from '../modules/delivery/delivery.routes.js';
import { confirmDeliveryReceipt } from '../modules/delivery/delivery.public-service.js';
import { createCustomerExperienceRouter } from '../modules/customer-experience/customer-experience.routes.js';
import { createCustomerRouter } from '../modules/customers/customer.routes.js';
import { createReviewRouter } from '../modules/reviews/review.routes.js';
import {
  recordCustomerOrderCompletion,
  upsertCustomerForOrder
} from '../modules/customers/customer.public-service.js';
import { listCustomerReviews } from '../modules/reviews/review.public-service.js';
import { listCustomerOrders } from '../modules/orders/order.public-service.js';
import { createPreparationRouter } from '../modules/preparation/preparation.routes.js';
import { createOrderRouter } from '../modules/orders/order.routes.js';
import {
  applyOrderPaymentSummary,
  getOrderForPayment,
  getOrderInvoicePayload,
  getOrderPaymentSummary
} from '../modules/orders/order.public-service.js';
import { createPaymentRouter } from '../modules/payments/payment.routes.js';
import { createInvoiceRouter } from '../modules/invoices/invoice.routes.js';
import { calculateOrderPaymentSummary } from '../modules/payments/payment.public-service.js';
import { buildInvoicePreview } from '../modules/invoices/invoice.public-service.js';
import {
  createSupplierSettlement,
  reverseSupplierSettlement,
  hasOpenShiftForEmployee,
  getOpenShiftWarnings,
  createSourceCashTransaction
} from '../modules/drawer/drawer.public-service.js';
import {
  listSupplierSummaries,
  assertSupplierExists
} from '../modules/suppliers/supplier.public-service.js';
import { listByEmployee } from '../modules/attendance/attendance.public-service.js';
import { listAuditByActor } from '../platform/audit/audit.queries.js';
import { employeeAuth } from '../platform/auth/employee-auth.middleware.js';
import { asyncHandler } from '../platform/http/async-handler.js';
import { sendSuccess } from '../platform/http/response.js';

export function createV1Router(dependencies = {}) {
  const router = Router();
  const runtimeDependencies = {
    ...dependencies,
    serviceContext: {
      ...dependencies.serviceContext,
      deepseek: dependencies.serviceContext?.deepseek ?? dependencies.config?.deepseek ?? null,
      mediaConfig: dependencies.serviceContext?.mediaConfig ?? dependencies.config?.media ?? null,
      materialsPort: dependencies.serviceContext?.materialsPort ?? {
        listBySupplier: listMaterialsBySupplier
      },
      suppliersPort: dependencies.serviceContext?.suppliersPort ?? {
        listSummaries: listSupplierSummaries,
        assertSupplierExists
      },
      warningsPort: dependencies.serviceContext?.warningsPort ?? {
        getSummary: getWarningsSummary
      },
      productsPort: dependencies.serviceContext?.productsPort ?? {
        listByMaterial: listProductsByMaterial
      },
      inventoryPort: dependencies.serviceContext?.inventoryPort ?? {
        simulate: simulateRecipeRequirements,
        createBatch: createBatchFromPurchase,
        lockMaterialSupplierAndUnits
      },
      drawerPort: dependencies.serviceContext?.drawerPort ?? {
        createSupplierSettlement,
        reverseSupplierSettlement,
        hasOpenShiftForEmployee,
        createSourceCashTransaction
      },
      drawerWarningsPort: dependencies.serviceContext?.drawerWarningsPort ?? {
        getOpenShiftWarnings
      },
      attendancePort: dependencies.serviceContext?.attendancePort ?? { listByEmployee },
      auditPort: dependencies.serviceContext?.auditPort ?? { listByActor: listAuditByActor },
      ordersPort: dependencies.serviceContext?.ordersPort ?? {
        getForPayment: getOrderForPayment,
        applyPaymentSummary: applyOrderPaymentSummary,
        getSummary: getOrderPaymentSummary,
        getInvoicePayload: getOrderInvoicePayload
      },
      ordersPaymentPort: dependencies.serviceContext?.ordersPaymentPort ?? {
        summary: calculateOrderPaymentSummary
      },
      ordersInvoicePort: dependencies.serviceContext?.ordersInvoicePort ?? {
        preview: buildInvoicePreview
      },
      ordersDeliveryPort: dependencies.serviceContext?.ordersDeliveryPort ?? {
        getByOrder: getAssignmentByOrder
      },
      customersPort: dependencies.serviceContext?.customersPort ?? {
        upsertForOrder: upsertCustomerForOrder,
        recordCompletion: recordCustomerOrderCompletion
      },
      customersOrdersPort: dependencies.serviceContext?.customersOrdersPort ?? {
        listByCustomer: listCustomerOrders
      },
      customersReviewsPort: dependencies.serviceContext?.customersReviewsPort ?? {
        listByCustomer: listCustomerReviews
      },
      deliveryPort: dependencies.serviceContext?.deliveryPort ?? {
        confirmReceipt: confirmDeliveryReceipt
      },
      tablesPort: dependencies.serviceContext?.tablesPort ?? {
        closeSession: closeSessionForOrder
      },
      tableServicesPort: dependencies.serviceContext?.tableServicesPort ?? {
        notifyProposal: createOrderReviewRequest,
        resolveProposalCalls: resolveProposalServices,
        closeSessionServices
      },
      orderCasesDeliveryPort: dependencies.serviceContext?.orderCasesDeliveryPort ?? {
        closeForCancelledOrder: closeCancelledAssignments
      },
      mediaPort: dependencies.serviceContext?.mediaPort ?? {
        assertReady: assertReadyAsset
      }
    }
  };
  router.get('/', (_req, res) =>
    res.json({ ok: true, data: { name: '404 Coffee API', version: 'v1' } })
  );
  router.use(createCatalogRouter(runtimeDependencies));
  router.use('/auth', createAuthRouter(runtimeDependencies));
  router.get(
    '/admin/bootstrap',
    employeeAuth(runtimeDependencies.config, runtimeDependencies.authDependencies),
    asyncHandler(async (req, res) =>
      sendSuccess(
        res,
        await getAdminBootstrap({
          ...req.auth,
          authRuntime: req.authRuntime,
          ...runtimeDependencies.serviceContext
        })
      )
    )
  );
  router.use(createEmployeeRouter(runtimeDependencies));
  router.use(createAttendanceRouter(runtimeDependencies));
  router.use(createSupplierRouter(runtimeDependencies));
  router.use(createInventoryRouter(runtimeDependencies));
  router.use(createWarningRouter(runtimeDependencies));
  router.use(createProductRouter(runtimeDependencies));
  router.use(createPurchaseRouter(runtimeDependencies));
  router.use(createPurchaseReturnRouter(runtimeDependencies));
  router.use(createDrawerRouter(runtimeDependencies));
  router.use(createTableGuestRouter(runtimeDependencies));
  router.use(createTableProposalRouter(runtimeDependencies));
  router.use(createTableServiceGuestRouter(runtimeDependencies));
  router.use(createTableServiceAdminRouter(runtimeDependencies));
  router.use(createOrderCasesRouter(runtimeDependencies));
  router.use(createMediaRouter(runtimeDependencies));
  router.use(createCustomerAiRouter(runtimeDependencies));
  router.use(createDashboardRouter(runtimeDependencies));
  router.use(createReportsRouter(runtimeDependencies));
  router.use(createAuditRouter(runtimeDependencies));
  router.use(createNotificationsRouter(runtimeDependencies));
  router.use(createRealtimeRouter(runtimeDependencies));
  router.use(createTablesRouter(runtimeDependencies));
  router.use(createDeliveryRouter(runtimeDependencies));
  router.use(createCustomerExperienceRouter(runtimeDependencies));
  router.use(createCustomerRouter(runtimeDependencies));
  router.use(createReviewRouter(runtimeDependencies));
  router.use(createPreparationRouter(runtimeDependencies));
  router.use(createOrderRouter(runtimeDependencies));
  router.use(createPaymentRouter(runtimeDependencies));
  router.use(createInvoiceRouter(runtimeDependencies));
  return router;
}
