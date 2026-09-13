export function sendSuccess(res, data, meta = {}) {
  if (res.headersSent || res.writableEnded) return res;
  return res.status(200).json({ ok: true, data, meta: buildMeta(res, meta) });
}

export function sendCreated(res, data, meta = {}) {
  if (res.headersSent || res.writableEnded) return res;
  return res.status(201).json({ ok: true, data, meta: buildMeta(res, meta) });
}

export function sendList(res, items, pageMeta, extra = {}) {
  if (res.headersSent || res.writableEnded) return res;
  const { hasNextPage, hasPreviousPage, sort, ...page } = pageMeta;
  return res.status(200).json({
    ok: true,
    data: { items, ...extra },
    meta: buildMeta(res, {
      ...page,
      hasNext: hasNextPage,
      hasPrevious: hasPreviousPage,
      sort: Object.entries(sort ?? {})
        .map(([key, value]) => `${key}:${value === -1 ? 'desc' : 'asc'}`)
        .join(',')
    })
  });
}

export function sendAccepted(res, data, meta = {}) {
  if (res.headersSent || res.writableEnded) return res;
  return res.status(202).json({ ok: true, data, meta: buildMeta(res, meta) });
}

export function sendServiceUnavailable(res, data, meta = {}) {
  if (res.headersSent || res.writableEnded) return res;
  return res.status(503).json({ ok: false, error: data, meta: buildMeta(res, meta) });
}

function buildMeta(res, meta) {
  return { requestId: res.locals.requestId, serverTime: new Date().toISOString(), ...meta };
}
