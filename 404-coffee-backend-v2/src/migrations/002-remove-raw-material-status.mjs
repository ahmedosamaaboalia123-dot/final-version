import mongoose from 'mongoose';

export async function up(context = {}) {
  const db = context.connection?.db ?? mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not available');

  const materials = db.collection('rawmaterials');
  await materials.updateMany({}, { $unset: { status: '' } });

  const indexes = await materials.indexes();
  for (const index of indexes) {
    if (Object.keys(index.key ?? {}).includes('status')) await materials.dropIndex(index.name);
  }

  await materials.createIndex(
    { supplierId: 1, name: 1 },
    { name: 'supplierId_1_name_1' }
  );
  await materials.createIndex(
    { normalizedName: 1, _id: 1 },
    { name: 'normalizedName_1__id_1' }
  );
}
