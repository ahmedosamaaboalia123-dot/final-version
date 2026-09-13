import mongoose from 'mongoose';

export async function up(context = {}) {
  const db = context.connection?.db ?? mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not available');
  const suppliers = db.collection('suppliers');
  await suppliers.updateMany({}, { $unset: { supplierType: '', status: '', statusChangeReason: '' } });
  const indexes = await suppliers.indexes();
  for (const index of indexes) {
    const fields = Object.keys(index.key ?? {});
    if (fields.includes('status') || fields.includes('supplierType')) await suppliers.dropIndex(index.name);
  }
  await suppliers.createIndex({ createdAt: -1, _id: -1 }, { name: 'createdAt_-1__id_-1' });
  await suppliers.createIndex({ city: 1 }, { name: 'city_1' });
  const entries = db.collection('supplieraccountentries');
  await entries.createIndex(
    { replacesEntryId: 1 },
    { unique: true, partialFilterExpression: { replacesEntryId: { $type: 'objectId' } }, name: 'replacesEntryId_1' }
  );
}
