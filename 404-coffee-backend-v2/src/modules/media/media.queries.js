import { join } from 'node:path';
import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { MediaAsset } from './media.models.js';
import { mediaConfig, signAssetUrl, verifyAssetUrl } from './media.service.js';

export const assetDto = (asset) => ({
  id: String(asset._id),
  assetNo: asset.assetNo,
  purpose: asset.purpose,
  mimeType: asset.mimeType,
  sizeBytes: asset.sizeBytes,
  checksum: asset.checksum,
  status: asset.status,
  uploadedAt: asset.uploadedAt,
  version: asset.version ?? 0
});

export async function listAssets(filters = {}, context = {}) {
  const models = context.mediaModels ?? { MediaAsset };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.status) query.status = filters.status;
  const [rows, totalItems] = await Promise.all([
    models.MediaAsset.find(query).sort({ uploadedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.MediaAsset.countDocuments(query)
  ]);
  return {
    items: rows.map(assetDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { uploadedAt: -1 } })
  };
}

export async function getAssetContent(assetId, query, context = {}) {
  const models = context.mediaModels ?? { MediaAsset };
  if (!verifyAssetUrl(assetId, query.sig, query.exp, context))
    throw new ApiError({
      code: 'MEDIA_LINK_INVALID',
      status: 403,
      messageAr: 'رابط الصورة غير صالح'
    });
  const asset = await models.MediaAsset.findById(assetId).lean();
  if (!asset || asset.status !== 'READY')
    throw new ApiError({ code: 'ASSET_NOT_FOUND', status: 404, messageAr: 'الصورة غير موجودة' });
  const config = mediaConfig(context);
  return { filePath: join(config.storageDir, asset.storageKey), mimeType: asset.mimeType };
}

export async function getSignedAsset(assetId, context = {}) {
  const models = context.mediaModels ?? { MediaAsset };
  const asset = await models.MediaAsset.findById(assetId).lean();
  if (!asset || asset.status !== 'READY')
    throw new ApiError({ code: 'ASSET_NOT_FOUND', status: 404, messageAr: 'الصورة غير موجودة' });
  return { asset: assetDto(asset), signed: signAssetUrl(assetId, context) };
}
