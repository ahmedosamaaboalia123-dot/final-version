import { compare, divide, toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import { MeasurementUnit } from './inventory.models.js';

export const toUnitDto = (unit) => ({
  id: String(unit._id),
  code: unit.code,
  nameAr: unit.nameAr,
  kind: unit.kind,
  physicalFactor: toApiString(unit.physicalFactor),
  isActive: unit.isActive,
  version: unit.version ?? 0
});
export async function listMeasurementUnits(filters = {}, context = {}) {
  const model = context.models?.MeasurementUnit ?? MeasurementUnit;
  const query = {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.active ? { isActive: filters.active === 'true' } : {})
  };
  return (await model.find(query).sort({ kind: 1, physicalFactor: -1, _id: 1 }).lean()).map(
    toUnitDto
  );
}
export function calculateConversionFactor(largeUnit, smallUnit) {
  if (largeUnit.kind !== smallUnit.kind && largeUnit.kind !== 'CONTAINER')
    throw new ApiError({
      code: 'UNIT_KIND_MISMATCH',
      status: 422,
      messageAr: 'الوحدتان غير متوافقتين'
    });
  const factor = divide(largeUnit.physicalFactor, smallUnit.physicalFactor, 6);
  if (compare(factor, '1') < 0)
    throw new ApiError({
      code: 'INVALID_UNIT_ORDER',
      status: 422,
      messageAr: 'الوحدة الكبيرة يجب أن تكون أكبر من أو تساوي الصغيرة'
    });
  return toApiString(factor);
}
