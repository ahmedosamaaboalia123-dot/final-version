export function startWorkers(jobs = [], { logger = console } = {}) {
  const timers = jobs.map((job) => {
    const tick = async () => {
      try {
        await job.run();
      } catch (error) {
        logger.error({ worker: job.name, code: error?.code ?? 'WORKER_FAILED' });
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, job.intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return timer;
  });
  return {
    stop() {
      for (const timer of timers) clearInterval(timer);
    }
  };
}
