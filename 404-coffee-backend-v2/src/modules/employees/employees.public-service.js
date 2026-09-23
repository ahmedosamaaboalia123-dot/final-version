import { Employee } from './employee.models.js';

export async function getEmployeeNames(ids = [], context = {}) {
  const model = context.models?.Employee ?? Employee;
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if (!unique.length) return {};
  const rows = await model.find({ _id: { $in: unique } }).select('name').lean();
  return Object.fromEntries(
    rows.map((row) => [String(row._id), row.name ?? null])
  );
}
