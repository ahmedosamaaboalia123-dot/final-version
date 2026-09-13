import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import { ApiError } from '../http/api-error.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -50, toExpPos: 50 });

export function decimal(value) {
  try {
    const normalized =
      value instanceof mongoose.Types.Decimal128 ? value.toString() : String(value);
    const result = new Decimal(normalized);
    if (!result.isFinite()) throw new Error('not finite');
    return result;
  } catch (cause) {
    throw new ApiError({
      code: 'INVALID_DECIMAL',
      status: 422,
      messageAr: 'القيمة العشرية غير صحيحة',
      cause
    });
  }
}

export const add = (a, b) => decimal(a).plus(decimal(b));
export const subtract = (a, b) => decimal(a).minus(decimal(b));
export const multiply = (a, b) => decimal(a).times(decimal(b));
export function divide(a, b, scale = 6) {
  if (decimal(b).isZero())
    throw new ApiError({
      code: 'DIVISION_BY_ZERO',
      status: 422,
      messageAr: 'لا يمكن القسمة على صفر'
    });
  return decimal(a).div(decimal(b)).toDecimalPlaces(scale);
}
export const compare = (a, b) => decimal(a).comparedTo(decimal(b));
export const isPositive = (value) => decimal(value).greaterThan(0);
export const roundMoney = (value) => decimal(value).toDecimalPlaces(2);
export const roundQuantity = (value) => decimal(value).toDecimalPlaces(6);
export const toApiString = (value) => decimal(value).toFixed();
export const toDecimal128 = (value) => mongoose.Types.Decimal128.fromString(toApiString(value));
