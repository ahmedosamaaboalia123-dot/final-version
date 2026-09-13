import { Server } from 'socket.io';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { isRoomAllowed } from './realtime.rooms.js';
import { subscribeRealtime } from './realtime.publisher.js';

const MAX_SUBSCRIBE_ROOMS = 20;

function authenticateSocket(token, d = {}) {
  const req = {
    get: (name) => (String(name).toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined),
    requestId: `sock-${Date.now()}`,
    ip: 'socket'
  };
  return new Promise((resolve, reject) => {
    employeeAuth(d.config, d.authDependencies)(req, {}, (error) => {
      if (error || req.auth?.actorType !== 'EMPLOYEE') reject(error ?? new Error('unauthorized'));
      else resolve(req.auth);
    });
  });
}

export function attachSocketTransport(server, d = {}, ioFactory) {
  const createIo =
    ioFactory ??
    ((target) =>
      new Server(target, {
        cors: { origin: d.config?.http?.corsOrigins ?? [], credentials: false },
        maxHttpBufferSize: 1e5
      }));
  const io = createIo(server);
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (!token) throw new Error('unauthorized');
      socket.data.auth = await authenticateSocket(token, d);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    socket.on('subscribe', (rooms, ack) => {
      const wanted = (Array.isArray(rooms) ? rooms : []).slice(0, MAX_SUBSCRIBE_ROOMS);
      const identity = {
        kind: 'employee',
        actorId: String(socket.data.auth.actorId),
        permissions: [...(socket.data.auth.permissions ?? [])]
      };
      const allowed = wanted.filter(
        (room) => typeof room === 'string' && isRoomAllowed(room, identity)
      );
      for (const room of allowed) socket.join(room);
      if (typeof ack === 'function') ack({ rooms: allowed });
    });
  });
  const unsubscribe = subscribeRealtime(async ({ rooms, envelope }) => {
    for (const room of rooms) io.to(room).emit('event', envelope);
  });
  const detach = async () => {
    unsubscribe();
    if (typeof io.close === 'function') await io.close();
  };
  return { io, detach };
}
