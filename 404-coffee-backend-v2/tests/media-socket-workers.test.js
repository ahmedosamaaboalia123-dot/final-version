import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import {
  assertReadyAsset,
  deleteAsset,
  signAssetUrl,
  uploadAsset,
  verifyAssetUrl
} from '../src/modules/media/media.service.js';
import { createProduct } from '../src/modules/products/product.service.js';
import { attachSocketTransport } from '../src/modules/realtime/socket-transport.js';
import { publishRealtimeEvent } from '../src/modules/realtime/realtime.publisher.js';
import { startWorkers } from '../src/jobs/worker-runner.js';
import { tickOutbox } from '../src/jobs/outbox.job.js';
import { tickShiftWarnings } from '../src/jobs/shift-warnings.job.js';
import { tickReportExports } from '../src/jobs/exports.job.js';

const id = () => new mongoose.Types.ObjectId();
const jpeg = (size = 64) => {
  const buffer = Buffer.alloc(size, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
};
const mediaContext = (overrides = {}) => ({
  actorId: id(),
  actorType: 'EMPLOYEE',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 2 }) },
  mediaConfig: {
    storageDir: join(tmpdir(), 'media-batch26-tests'),
    urlSecret: 'test-media-url-secret-at-least-32-chars',
    maxBytes: 2 * 1024 * 1024
  },
  ...overrides
});

describe('media assets', () => {
  it('rejects empty oversized and fake images', async () => {
    const models = { MediaAsset: { create: vi.fn() } };
    await expect(
      uploadAsset({ buffer: Buffer.alloc(0) }, {}, { ...mediaContext(), mediaModels: models })
    ).rejects.toMatchObject({ code: 'MEDIA_EMPTY_FILE' });
    await expect(
      uploadAsset({ buffer: jpeg(3 * 1024 * 1024) }, {}, { ...mediaContext(), mediaModels: models })
    ).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
    await expect(
      uploadAsset(
        { buffer: Buffer.from([0x00, 0x01, 0x02, 0x03]) },
        {},
        { ...mediaContext(), mediaModels: models }
      )
    ).rejects.toMatchObject({ code: 'MEDIA_TYPE_REJECTED' });
    expect(models.MediaAsset.create).not.toHaveBeenCalled();
  });
  it('stores checksums and writes files for real images', async () => {
    let stored;
    const asset = await uploadAsset(
      { buffer: jpeg(), originalname: 'cup.jpg' },
      {},
      {
        ...mediaContext(),
        mediaModels: {
          MediaAsset: {
            create: async ([v]) => {
              stored = { _id: id(), ...v };
              return [stored];
            }
          }
        }
      }
    );
    expect(asset.mimeType).toBe('image/jpeg');
    expect(stored.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.storageKey).toBe('MED-00000002.jpg');
  });
  it('signs expiring urls and rejects tampered ones', () => {
    const context = mediaContext();
    const assetId = String(id());
    const { url, exp } = signAssetUrl(assetId, context);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(verifyAssetUrl(assetId, params.get('sig'), Number(params.get('exp')), context)).toBe(
      true
    );
    expect(verifyAssetUrl(assetId, params.get('sig'), 1, context)).toBe(false);
    expect(verifyAssetUrl(assetId, 'deadbeef', exp, context)).toBe(false);
    expect(exp).toBeGreaterThan(Date.now() / 1000);
  });
  it('gates product images on ready assets only', async () => {
    const ready = { _id: id(), status: 'READY' };
    await expect(
      assertReadyAsset('507f1f77bcf86cd799439011', {
        mediaModels: { MediaAsset: { findById: () => ({ lean: async () => null }) } }
      })
    ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    await expect(
      assertReadyAsset(String(ready._id), {
        mediaModels: {
          MediaAsset: {
            findById: () => ({ lean: async () => ({ ...ready, status: 'QUARANTINED' }) })
          }
        }
      })
    ).rejects.toMatchObject({ code: 'ASSET_NOT_READY' });
    await expect(
      assertReadyAsset(String(ready._id), {
        mediaModels: { MediaAsset: { findById: () => ({ lean: async () => ready }) } }
      })
    ).resolves.toMatchObject({ status: 'READY' });
  });
  it('refuses deleting images attached to products', async () => {
    const asset = {
      _id: id(),
      version: 0,
      status: 'READY',
      storageKey: 'MED-1.jpg',
      save: vi.fn()
    };
    await expect(
      deleteAsset(
        asset._id,
        { expectedVersion: 0 },
        {
          ...mediaContext(),
          mediaModels: { MediaAsset: { findOne: async () => asset } },
          mediaProductsPort: { isReferenced: async () => true }
        }
      )
    ).rejects.toMatchObject({ code: 'ASSET_IN_USE' });
    const done = await deleteAsset(
      asset._id,
      { expectedVersion: 0 },
      {
        ...mediaContext(),
        mediaModels: { MediaAsset: { findOne: async () => asset } },
        mediaProductsPort: { isReferenced: async () => false }
      }
    );
    expect(done.status).toBe('DELETED');
  });
  it('checks product images through the media port when present', async () => {
    const assertReady = vi.fn(async () => ({}));
    const models = {
      ProductCategory: {
        findOne: () => ({ session: async () => ({ _id: id(), status: 'ACTIVE' }) })
      },
      Product: { create: async ([v]) => [{ _id: id(), ...v }] }
    };
    await createProduct(
      { name: 'لاتيه', categoryId: String(id()), imageId: String(id()) },
      { session: {}, productModels: models, mediaPort: { assertReady } }
    );
    expect(assertReady).toHaveBeenCalledTimes(1);
  });
});

describe('socket transport', () => {
  const fakeIo = () => {
    const handlers = {};
    const emitted = [];
    const io = {
      handlers,
      emitted,
      use: vi.fn((fn) => {
        io.middleware = fn;
      }),
      on: vi.fn((event, fn) => {
        handlers[event] = fn;
      }),
      to: vi.fn((room) => ({
        emit: (event, envelope) => emitted.push({ room, event, envelope })
      })),
      close: vi.fn(async () => {})
    };
    return io;
  };
  it('rejects sockets without employee tokens', async () => {
    const io = fakeIo();
    attachSocketTransport({}, {}, () => io);
    const error = await new Promise((resolve) => {
      io.middleware({ handshake: { auth: {} }, data: {} }, (err) => resolve(err));
    });
    expect(String(error?.message ?? error)).toContain('unauthorized');
  });
  it('subscribes sockets only to allowed rooms and fans events out', async () => {
    const { clearRealtimeSubscribers } =
      await import('../src/modules/realtime/realtime.publisher.js');
    clearRealtimeSubscribers();
    const io = fakeIo();
    attachSocketTransport({}, {}, () => io);
    const joined = [];
    const socket = {
      handshake: { auth: { token: 'x' } },
      data: { auth: { actorId: 'emp1', permissions: ['orders.read'] } },
      join: (room) => joined.push(room),
      on: vi.fn()
    };
    const connect = io.handlers.connection;
    connect(socket);
    const subscribe = socket.on.mock.calls.find((call) => call[0] === 'subscribe')[1];
    let acked;
    subscribe(['order:abc', 'admin:orders', 'admin:preparation'], (response) => {
      acked = response;
    });
    expect(joined).toContain('order:abc');
    expect(joined).toContain('admin:orders');
    expect(joined).not.toContain('admin:preparation');
    expect(acked.rooms).toHaveLength(2);
    await publishRealtimeEvent({
      _id: id(),
      aggregateType: 'Order',
      aggregateId: 'abc',
      eventType: 'order.updated',
      sequence: 3,
      createdAt: new Date(),
      payloadSafe: { orderId: 'abc' }
    });
    expect(io.emitted.length).toBeGreaterThan(0);
    expect(io.emitted.every((entry) => entry.event === 'event')).toBe(true);
    clearRealtimeSubscribers();
  });
});

describe('background workers', () => {
  it('publishes claimed outbox events and buries the exhausted', async () => {
    const event = { _id: id(), attempts: 11, toObject: () => ({ _id: 'e' }) };
    const bury = vi.fn(async () => ({}));
    const result = await tickOutbox({
      outboxJobsPort: {
        claim: async () => [event],
        publish: async () => {
          throw new Error('bus down');
        },
        fanout: vi.fn(),
        mark: vi.fn(),
        bury
      }
    });
    expect(result).toMatchObject({ claimed: 1, dead: 1 });
    expect(bury).toHaveBeenCalledTimes(1);
  });
  it('retries failed publishes instead of dropping them', async () => {
    const event = { _id: id(), attempts: 2 };
    const retry = vi.fn(async () => ({}));
    const result = await tickOutbox({
      outboxJobsPort: {
        claim: async () => [event],
        publish: async () => {
          throw new Error('bus down');
        },
        fanout: vi.fn(),
        mark: vi.fn(),
        retry,
        bury: vi.fn()
      }
    });
    expect(result).toMatchObject({ claimed: 1, retried: 1 });
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('notifies shift owners once per threshold', async () => {
    const alert = {
      _id: id(),
      shiftId: id(),
      shiftNoSnapshot: 'SH-1',
      thresholdHours: 12,
      openedBy: id()
    };
    const notify = vi.fn(async () => ({ created: 1, skipped: 0 }));
    const result = await tickShiftWarnings({
      shiftWarningJobsPort: {
        emit: async () => [alert],
        notify
      }
    });
    expect(result).toMatchObject({ alerts: 1, notified: 1 });
    expect(notify.mock.calls[0][1]).toMatchObject({ type: 'SHIFT_OPEN_TOO_LONG' });
    expect(notify.mock.calls[0][1].deduplicationKey).toContain('12');
  });
  it('processes queued exports and marks failures', async () => {
    const job = { _id: id() };
    const process = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
    const updated = [];
    const context = {
      exportsJobsModels: {
        ReportExport: {
          find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [job, job] }) }) }),
          findByIdAndUpdate: async (query, update) => {
            updated.push(update.$set.status);
            return {};
          }
        }
      },
      exportsJobsPort: { process }
    };
    const result = await tickReportExports(context);
    expect(result).toMatchObject({ queued: 2, processed: 1, failed: 1 });
    expect(updated).toContain('FAILED');
  });
  it('runs worker ticks on a schedule until stopped', async () => {
    let calls = 0;
    const workers = startWorkers(
      [{ name: 'fast', intervalMs: 5, run: async () => ({ calls: (calls += 1) }) }],
      { logger: { error: () => {} } }
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    workers.stop();
    const frozen = calls;
    expect(frozen).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(frozen);
  });
});
