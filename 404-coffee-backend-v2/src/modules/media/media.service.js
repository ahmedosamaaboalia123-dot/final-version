import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { nextSequence } from '../../platform/database/sequence.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Product } from '../products/product.models.js';
import { MediaAsset } from './media.models.js';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = [
  { mime: 'image/jpeg', extension: '.jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', extension: '.png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    mime: 'image/webp',
    extension: '.webp',
    prefix: [0x52, 0x49, 0x46, 0x46],
    suffix: [0x57, 0x45, 0x42, 0x50],
    suffixAt: 8
  }
];

function detectImage(buffer) {
  for (const type of ALLOWED) {
    const head = type.magic ?? type.prefix;
    if (!head.every((byte, index) => buffer[index] === byte)) continue;
    if (type.suffix && !type.suffix.every((byte, index) => buffer[type.suffixAt + index] === byte))
      continue;
    return type;
  }
  return null;
}

export function mediaConfig(context = {}) {
  return {
    storageDir: resolve(
      context.mediaConfig?.storageDir ?? process.env.MEDIA_STORAGE_DIR ?? './uploads'
    ),
    urlSecret: context.mediaConfig?.urlSecret ?? process.env.MEDIA_URL_SECRET ?? '',
    maxBytes: context.mediaConfig?.maxBytes ?? MAX_BYTES
  };
}

export async function uploadAsset(file, input = {}, context = {}) {
  const models = context.mediaModels ?? { MediaAsset };
  const config = mediaConfig(context);
  if (!file?.buffer || file.buffer.length === 0)
    throw new ApiError({ code: 'MEDIA_EMPTY_FILE', status: 422, messageAr: 'ملف الصورة فارغ' });
  if (file.buffer.length > config.maxBytes)
    throw new ApiError({
      code: 'MEDIA_TOO_LARGE',
      status: 413,
      messageAr: 'حجم الصورة أكبر من المسموح'
    });
  const detected = detectImage(file.buffer);
  if (!detected)
    throw new ApiError({
      code: 'MEDIA_TYPE_REJECTED',
      status: 422,
      messageAr: 'نوع الملف غير مدعوم (صور فقط)'
    });
  const sequence = await nextSequence('media-asset', context);
  const assetNo = `MED-${String(sequence).padStart(8, '0')}`;
  const checksum = createHash('sha256').update(file.buffer).digest('hex');
  const [asset] = await models.MediaAsset.create([
    {
      assetNo,
      purpose: input.purpose ?? 'PRODUCT_IMAGE',
      mimeType: detected.mime,
      sizeBytes: file.buffer.length,
      checksum,
      storageKey: `${assetNo}${detected.extension}`,
      uploadedBy: context.actorId,
      operationRequestId: context.operationRequestId
    }
  ]);
  try {
    await mkdir(config.storageDir, { recursive: true });
    await writeFile(join(config.storageDir, asset.storageKey), file.buffer);
  } catch (_error) {
    await models.MediaAsset.findByIdAndUpdate(asset._id, {
      $set: { status: 'QUARANTINED', quarantineReason: 'storage-write-failed' }
    });
    throw new ApiError({
      code: 'MEDIA_STORAGE_FAILED',
      status: 503,
      messageAr: 'تعذر حفظ الصورة حاليًا'
    });
  }
  return asset;
}

export async function assertReadyAsset(assetId, context = {}) {
  const models = context.mediaModels ?? { MediaAsset };
  const asset = await models.MediaAsset.findById(assetId).lean();
  if (!asset || asset.status === 'DELETED')
    throw new ApiError({ code: 'ASSET_NOT_FOUND', status: 404, messageAr: 'الصورة غير موجودة' });
  if (asset.status !== 'READY')
    throw new ApiError({
      code: 'ASSET_NOT_READY',
      status: 409,
      messageAr: 'الصورة غير صالحة للاستخدام'
    });
  return asset;
}

export function signAssetUrl(assetId, context = {}) {
  const config = mediaConfig(context);
  if (!config.urlSecret)
    throw new ApiError({ code: 'MEDIA_URL_DISABLED', status: 503, messageAr: 'روابط الصور معطلة' });
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  const data = `${assetId}.${exp}`;
  const sig = createHmac('sha256', config.urlSecret).update(data).digest('hex');
  return { url: `/media/${assetId}/content?sig=${sig}&exp=${exp}`, exp };
}

export function verifyAssetUrl(assetId, sig, exp, context = {}) {
  const config = mediaConfig(context);
  if (!config.urlSecret || !sig || !exp) return false;
  if (Number(exp) * 1000 <= Date.now()) return false;
  const expected = createHmac('sha256', config.urlSecret).update(`${assetId}.${exp}`).digest();
  const supplied = Buffer.from(String(sig), 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function deleteAsset(assetId, input, context = {}) {
  const models = context.mediaModels ?? { MediaAsset };
  const isReferenced =
    context.mediaProductsPort?.isReferenced ??
    (async (targetId, ctx) => {
      const productModels = ctx.productModels ?? { Product };
      const count = await productModels.Product.countDocuments({ imageId: targetId });
      return count > 0;
    });
  const asset = await models.MediaAsset.findOne({ _id: assetId, version: input.expectedVersion });
  if (!asset || asset.status === 'DELETED')
    throw new ApiError({
      code: 'ASSET_VERSION_CONFLICT',
      status: 409,
      messageAr: 'الصورة غير موجودة أو تغيرت'
    });
  if (await isReferenced(asset._id, context))
    throw new ApiError({
      code: 'ASSET_IN_USE',
      status: 409,
      messageAr: 'الصورة مستخدمة في منتج ولا يمكن حذفها'
    });
  asset.status = 'DELETED';
  asset.deletedAt = context.now ?? new Date();
  asset.deleteReason = input.reason ?? 'admin-delete';
  await asset.save();
  const config = mediaConfig(context);
  await unlink(join(config.storageDir, asset.storageKey)).catch(() => null);
  return asset;
}
