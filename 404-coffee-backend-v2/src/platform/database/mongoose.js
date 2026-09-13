import mongoose from 'mongoose';

let connectionState = { connected: false, lastError: null };

export async function connectMongo({ uri, connectTimeoutMs, queryMaxTimeMs = 900 }) {
  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', false);
  mongoose.set('maxTimeMS', queryMaxTimeMs);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: connectTimeoutMs,
    maxPoolSize: 20,
    minPoolSize: 1
  });
  connectionState = { connected: true, lastError: null };
  return mongoose.connection;
}

export async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connectionState = { connected: false, lastError: null };
}

export function markMongoConnectionFailure(error) {
  connectionState = { connected: false, lastError: error?.message ?? 'Unknown database error' };
}

export function getMongoHealth() {
  const connected = mongoose.connection.readyState === 1 && connectionState.connected;
  return {
    status: connected ? 'UP' : 'DOWN',
    readyState: mongoose.connection.readyState,
    error: connected ? null : connectionState.lastError
  };
}
