import { RawMaterial } from './inventory.models.js';

export async function lockMaterialSupplierAndUnits(materialIds, reason, context = {}) {
  const model = context.inventoryModels?.RawMaterial ?? context.models?.RawMaterial ?? RawMaterial;
  const now = context.now ?? new Date();
  return model.updateMany(
    { _id: { $in: materialIds }, unitsLocked: false },
    {
      $set: {
        unitsLocked: true,
        supplierLockedAt: now,
        supplierLockReason: reason
      }
    },
    { session: context.session }
  );
}
