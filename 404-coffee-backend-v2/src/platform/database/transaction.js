import mongoose from 'mongoose';

const TRANSIENT_LABEL = 'TransientTransactionError';
const UNKNOWN_COMMIT_LABEL = 'UnknownTransactionCommitResult';

export const isTransientTransactionError = (error) =>
  Boolean(error?.hasErrorLabel?.(TRANSIENT_LABEL));
export const isUnknownCommitResult = (error) =>
  Boolean(error?.hasErrorLabel?.(UNKNOWN_COMMIT_LABEL));

export async function runInTransaction(work, context = {}, options = {}) {
  if (context.session) return work(context);
  const maxAttempts = options.maxAttempts ?? 3;
  const startSession = options.startSession ?? (() => mongoose.startSession());
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work({ ...context, session, transactionAttempt: attempt });
      }, options.transactionOptions);
      return result;
    } catch (error) {
      lastError = error;
      if (isUnknownCommitResult(error) && options.resolveUnknownCommit) {
        const resolved = await options.resolveUnknownCommit(error, context);
        if (resolved !== undefined) return resolved;
      }
      if (!isTransientTransactionError(error) || attempt === maxAttempts) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}
