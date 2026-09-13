import { add, toApiString, toDecimal128 } from '../../platform/database/decimal.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { normalizePhone } from '../../shared/utils/normalize-phone.js';
import { normalizeName } from '../../shared/utils/normalize-name.js';
import { Customer } from './customer.models.js';

const defaults = { Customer };

async function record(kind, customerId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'customers',
      action: kind,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'Customer', id: customerId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'Customer',
      aggregateId: String(customerId),
      eventType: kind,
      payload,
      sequence: payload.sequence ?? 1
    },
    context
  );
}

export async function upsertCustomerForOrder(input, orderMeta = {}, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.customerModels ?? defaults;
      const phoneNormalized = normalizePhone(input.phone);
      const orderTotal = orderMeta.orderTotal ?? '0';
      const orderCreatedAt = orderMeta.orderCreatedAt ?? context.now ?? new Date();
      let customer = await models.Customer.findOne({ phoneNormalized }).session(tx.session);
      if (!customer) {
        try {
          const [created] = await models.Customer.create(
            [
              {
                name: input.name,
                normalizedName: normalizeName(input.name),
                phone: input.phone,
                phoneNormalized,
                address: input.address,
                orderCount: 1,
                completedOrderCount: 0,
                lifetimeValue: toDecimal128(orderTotal),
                lastOrderAt: orderCreatedAt,
                lastProfileOrderAt: orderCreatedAt,
                operationRequestId: context.operationRequestId
              }
            ],
            { session: tx.session }
          );
          customer = created;
          await record(
            'customer.upserted',
            customer._id,
            { customerId: String(customer._id), phoneNormalized },
            { ...context, ...tx }
          );
          return customer;
        } catch (error) {
          if (error?.code !== 11000) throw error;
          customer = await models.Customer.findOne({ phoneNormalized }).session(tx.session);
          if (!customer) throw error;
        }
      }
      const isNewer = !customer.lastProfileOrderAt || orderCreatedAt >= customer.lastProfileOrderAt;
      if (isNewer) {
        customer.name = input.name;
        customer.normalizedName = normalizeName(input.name);
        if (input.address !== undefined) customer.address = input.address;
        customer.lastProfileOrderAt = orderCreatedAt;
      }
      customer.orderCount += 1;
      customer.lifetimeValue = toDecimal128(
        add(toApiString(customer.lifetimeValue ?? '0'), orderTotal)
      );
      if (!customer.lastOrderAt || orderCreatedAt >= customer.lastOrderAt)
        customer.lastOrderAt = orderCreatedAt;
      await customer.save({ session: tx.session });
      await record(
        'customer.upserted',
        customer._id,
        { customerId: String(customer._id), phoneNormalized },
        { ...context, ...tx }
      );
      return customer;
    },
    context,
    context.transactionOptions
  );
}

export async function recordCustomerOrderCompletion(customerId, context = {}) {
  if (!customerId) return null;
  return runInTransaction(
    async (tx) => {
      const models = context.customerModels ?? defaults;
      const customer = await models.Customer.findById(customerId).session(tx.session);
      if (!customer) return null;
      customer.completedOrderCount += 1;
      await customer.save({ session: tx.session });
      return customer;
    },
    context,
    context.transactionOptions
  );
}

export async function createCustomer(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.customerModels ?? defaults;
      const phoneNormalized = normalizePhone(input.phone);
      const existing = await models.Customer.findOne({ phoneNormalized }).session(tx.session);
      if (existing)
        throw new ApiError({
          code: 'CUSTOMER_PHONE_EXISTS',
          status: 409,
          messageAr: 'يوجد عميل بهذا الهاتف بالفعل'
        });
      const [customer] = await models.Customer.create(
        [
          {
            name: input.name,
            normalizedName: normalizeName(input.name),
            phone: input.phone,
            phoneNormalized,
            address: input.address,
            socialLinks: input.socialLinks ?? [],
            orderCount: 0,
            completedOrderCount: 0,
            lifetimeValue: toDecimal128('0'),
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      await record(
        'customer.created',
        customer._id,
        { customerId: String(customer._id), phoneNormalized },
        { ...context, ...tx }
      );
      return customer;
    },
    context,
    context.transactionOptions
  );
}

export async function updateCustomerProfile(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.customerModels ?? defaults;
      const customer = await models.Customer.findOne({
        _id: id,
        version: input.expectedVersion
      }).session(tx.session);
      if (!customer)
        throw new ApiError({
          code: 'CUSTOMER_VERSION_CONFLICT',
          status: 409,
          messageAr: 'العميل غير موجود أو تغير'
        });
      if (input.name !== undefined) {
        customer.name = input.name;
        customer.normalizedName = normalizeName(input.name);
      }
      if (input.address !== undefined) customer.address = input.address;
      if (input.socialLinks !== undefined) customer.socialLinks = input.socialLinks;
      if (input.status !== undefined) {
        customer.status = input.status;
        customer.blockReason = input.status === 'BLOCKED' ? input.reason : undefined;
      }
      await customer.save({ session: tx.session });
      await record(
        'customer.updated',
        customer._id,
        { customerId: String(customer._id) },
        { ...context, ...tx }
      );
      return customer;
    },
    context,
    context.transactionOptions
  );
}
