import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from '@/engine/worker-pool';

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;

  constructor(public url: unknown, public opts: unknown) {}

  postMessage(_message: unknown) {
    // Simulated in tests
  }

  terminate() {
    this.terminated = true;
  }
}

describe('WorkerPool', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    (globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it('resolves job promise when worker replies with ok=true', async () => {
    const pool = new WorkerPool('dummy-worker.js', 'test-pool', 1);
    const runPromise = pool.run({ id: '1', type: 'test' });

    // Access active worker slot and trigger success message
    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    expect(allSlots.length).toBe(1);
    allSlots[0].worker.onmessage?.({
      data: { id: '1', ok: true, result: { payload: 'success' } },
    } as MessageEvent);

    const res = await runPromise;
    expect(res).toEqual({ payload: 'success' });
    pool.destroy();
  });

  it('rejects job promise immediately when worker crashes or triggers onerror', async () => {
    const pool = new WorkerPool('dummy-worker.js', 'test-pool', 1);
    const runPromise = pool.run({ id: '2', type: 'crash' });

    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    const initialWorker = allSlots[0].worker;

    // Trigger onerror on worker
    const errorEvent = new Error('Out of memory');
    initialWorker.onerror?.(errorEvent);

    await expect(runPromise).rejects.toThrow('Out of memory');
    expect(initialWorker.terminated).toBe(true);

    // Verify self-healing: pool replaces failed worker with new active worker
    const newWorker = allSlots[0].worker;
    expect(newWorker).not.toBe(initialWorker);

    // New worker can process next job successfully
    const nextPromise = pool.run({ id: '3', type: 'recovery' });
    newWorker.onmessage?.({
      data: { id: '3', ok: true, result: 'recovered' },
    } as MessageEvent);

    await expect(nextPromise).resolves.toBe('recovered');
    pool.destroy();
  });

  it('rejects pending and queued jobs when pool is destroyed', async () => {
    const pool = new WorkerPool('dummy-worker.js', 'test-pool', 1);
    const runPromise1 = pool.run({ id: 'active', type: 'run' });
    const runPromise2 = pool.run({ id: 'queued', type: 'run' });

    pool.destroy();

    await expect(runPromise1).rejects.toThrow('Pool destroyed');
    await expect(runPromise2).rejects.toThrow('Pool destroyed');
    await expect(pool.run({ id: 'after', type: 'run' })).rejects.toThrow('Pool destroyed');
  });
});
