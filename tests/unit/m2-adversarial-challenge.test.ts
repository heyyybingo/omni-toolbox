import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parsePageRange } from '@/lib/utils';
import { WorkerPool } from '@/engine/worker-pool';

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  postedMessages: unknown[] = [];

  constructor(public url: unknown, public opts: unknown) {}

  postMessage(message: unknown) {
    this.postedMessages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

describe('Adversarial Challenge: parsePageRange', () => {
  describe('Inverted ranges', () => {
    it('handles inverted ranges (B-A) within valid document pages', () => {
      expect(parsePageRange('3-1', 5)).toEqual([0, 1, 2]);
      expect(parsePageRange('5-2', 5)).toEqual([1, 2, 3, 4]);
      expect(parsePageRange('4-4', 5)).toEqual([3]);
    });

    it('handles inverted ranges with one bound outside page count', () => {
      // 10-3: min 3, max 10. Clamped to [3, 5] -> pages 3, 4, 5 -> indices [2, 3, 4]
      expect(parsePageRange('10-3', 5)).toEqual([2, 3, 4]);
      // 5-0: min 0, max 5. Clamped to [1, 5] -> pages 1, 2, 3, 4, 5 -> indices [0, 1, 2, 3, 4]
      expect(parsePageRange('5-0', 5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('rejects inverted ranges where both bounds are beyond page count', () => {
      // 10-8 on pageCount 5: min 8, max 10. Clamped to [8, 5], loop doesn't run, 0 pages -> throws
      expect(() => parsePageRange('10-8', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('8-10', 5)).toThrow('页码范围无效');
    });

    it('rejects inverted ranges where both bounds are 0', () => {
      expect(() => parsePageRange('0-0', 5)).toThrow('页码范围无效');
    });
  });

  describe('Open ranges', () => {
    it('handles open-ended range "A-"', () => {
      expect(parsePageRange('1-', 5)).toEqual([0, 1, 2, 3, 4]);
      expect(parsePageRange('3-', 5)).toEqual([2, 3, 4]);
      expect(parsePageRange('5-', 5)).toEqual([4]);
      expect(parsePageRange(' 2 - ', 4)).toEqual([1, 2, 3]);
    });

    it('handles open-start range "-N"', () => {
      expect(parsePageRange('-1', 5)).toEqual([0]);
      expect(parsePageRange('-3', 5)).toEqual([0, 1, 2]);
      expect(parsePageRange('-5', 5)).toEqual([0, 1, 2, 3, 4]);
      expect(parsePageRange('-10', 4)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange(' - 3 ', 5)).toEqual([0, 1, 2]);
    });

    it('handles bare hyphen "-" and surrounded with spaces', () => {
      expect(parsePageRange('-', 5)).toEqual([0, 1, 2, 3, 4]);
      expect(parsePageRange('  -  ', 3)).toEqual([0, 1, 2]);
      expect(parsePageRange('-', 1)).toEqual([0]);
    });

    it('handles "0-" by clamping start to 1', () => {
      expect(parsePageRange('0-', 5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('rejects "-0" when no other valid ranges are given', () => {
      expect(() => parsePageRange('-0', 5)).toThrow('页码范围无效');
    });

    it('rejects "A-" when A exceeds totalPages', () => {
      expect(() => parsePageRange('6-', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('100-', 5)).toThrow('页码范围无效');
    });
  });

  describe('Out of range and boundary conditions', () => {
    it('rejects discrete pages outside [1, totalPages]', () => {
      expect(() => parsePageRange('0', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('6', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('999999', 5)).toThrow('页码范围无效');
    });

    it('clamps ranges that partially overlap valid page interval', () => {
      expect(parsePageRange('0-3', 5)).toEqual([0, 1, 2]);
      expect(parsePageRange('3-10', 5)).toEqual([2, 3, 4]);
      expect(parsePageRange('0-10', 5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('skips out-of-bound discrete tokens if at least one valid token exists', () => {
      expect(parsePageRange('0, 2', 5)).toEqual([1]);
      expect(parsePageRange('1, 99', 5)).toEqual([0]);
    });

    it('works correctly for single-page documents (pageCount = 1)', () => {
      expect(parsePageRange('1', 1)).toEqual([0]);
      expect(parsePageRange('1-1', 1)).toEqual([0]);
      expect(parsePageRange('1-', 1)).toEqual([0]);
      expect(parsePageRange('-1', 1)).toEqual([0]);
      expect(parsePageRange('-', 1)).toEqual([0]);
      expect(() => parsePageRange('2', 1)).toThrow('页码范围无效');
      expect(() => parsePageRange('2-', 1)).toThrow('页码范围无效');
    });

    it('handles totalPages <= 0', () => {
      expect(parsePageRange('', 0)).toEqual([]);
      expect(parsePageRange('', -5)).toEqual([]);
      expect(() => parsePageRange('1', 0)).toThrow('页码范围无效');
      expect(() => parsePageRange('1-2', 0)).toThrow('页码范围无效');
      expect(() => parsePageRange('-', -1)).toThrow('页码范围无效');
    });
  });

  describe('Multi-hyphen patterns', () => {
    it('rejects pieces with two or more hyphens', () => {
      expect(() => parsePageRange('1-2-3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('--', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('---', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1--3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('--3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('3--', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('-1-3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1-2-3-4', 5)).toThrow('页码范围无效');
    });
  });

  describe('Negative numbers and special minus cases', () => {
    it('interprets negative single token as open-start range (-N)', () => {
      // In range syntax, "-3" has piece.includes('-') === true and aRaw === "", bRaw === "3"
      expect(parsePageRange('-3', 5)).toEqual([0, 1, 2]);
    });

    it('rejects multi-hyphen negative ranges like -2-5 or 2--5', () => {
      expect(() => parsePageRange('-2-5', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('2--5', 5)).toThrow('页码范围无效');
    });
  });

  describe('Non-numeric and malformed inputs', () => {
    it('rejects non-numeric characters and words', () => {
      expect(() => parsePageRange('abc', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1-abc', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('abc-3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('foo-bar', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('one', 5)).toThrow('页码范围无效');
    });

    it('rejects decimal / floating-point numbers', () => {
      expect(() => parsePageRange('1.5', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1-2.5', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1.0-3', 5)).toThrow('页码范围无效');
    });

    it('rejects scientific notation, hex, and plus sign', () => {
      expect(() => parsePageRange('1e2', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('0x10', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('+3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('+1-+3', 5)).toThrow('页码范围无效');
    });

    it('rejects internal spaces within number tokens', () => {
      expect(() => parsePageRange('1 2', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1 2-4', 5)).toThrow('页码范围无效');
    });

    it('rejects special symbols and punctuation', () => {
      expect(() => parsePageRange('1..3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1:3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1/3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1~3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1;3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('1#3', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('NaN', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange('Infinity', 5)).toThrow('页码范围无效');
    });

    it('rejects empty commas or pure whitespace parts that yield no pages', () => {
      expect(() => parsePageRange(',,,', 5)).toThrow('页码范围无效');
      expect(() => parsePageRange(',  , ,', 5)).toThrow('页码范围无效');
    });

    it('returns full document for empty / null / undefined range input', () => {
      expect(parsePageRange('', 4)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange(null, 4)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange(undefined, 4)).toEqual([0, 1, 2, 3]);
      expect(parsePageRange('   ', 4)).toEqual([0, 1, 2, 3]);
    });
  });

  describe('Randomized Fuzzing / Stress Generator', () => {
    it('survives 200 randomized range expressions without uncaught unexpected crashes', () => {
      const tokens = [
        '', '1', '2', '5', '10', '0', '-1', '1-', '-3', '3-1', '1-2-3', '--', 'abc',
        ' 1 ', ' - ', '999', '0-10', '1.5', '+2', '#', 'NaN', 'null', 'undefined',
      ];

      for (let i = 0; i < 200; i++) {
        const numTokens = 1 + Math.floor(Math.random() * 4);
        const expr = Array.from({ length: numTokens }, () => tokens[Math.floor(Math.random() * tokens.length)]).join(',');
        const pageCount = Math.floor(Math.random() * 10);

        try {
          const res = parsePageRange(expr, pageCount);
          // If it succeeded, verify contract invariants:
          // 1. All indices must be integers in [0, pageCount - 1]
          for (const idx of res) {
            expect(Number.isInteger(idx)).toBe(true);
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(pageCount);
          }
          // 2. Strict ascending order
          for (let k = 1; k < res.length; k++) {
            expect(res[k]).toBeGreaterThan(res[k - 1]);
          }
          // 3. If pageCount > 0, res.length must be > 0
          if (pageCount > 0) {
            expect(res.length).toBeGreaterThan(0);
          }
        } catch (e: unknown) {
          // If it threw, it must be Error('页码范围无效')
          expect(e).toBeInstanceOf(Error);
          expect((e as Error).message).toBe('页码范围无效');
        }
      }
    });
  });
});

describe('Adversarial Challenge: WorkerPool.onerror', () => {
  const originalWorker = globalThis.Worker;

  beforeEach(() => {
    (globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it('rejects immediately with Error message and terminates crashed worker', async () => {
    const pool = new WorkerPool('dummy.js', 'test-pool', 1);
    const promise = pool.run({ id: '1', type: 'test' });

    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    const worker = allSlots[0].worker;

    worker.onerror?.(new Error('Fatal worker crash'));

    await expect(promise).rejects.toThrow('Fatal worker crash');
    expect(worker.terminated).toBe(true);
    pool.destroy();
  });

  it('handles ErrorEvent object with .message property', async () => {
    const pool = new WorkerPool('dummy.js', 'test-pool', 1);
    const promise = pool.run({ id: '2', type: 'test' });

    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    const worker = allSlots[0].worker;

    // Simulate browser ErrorEvent
    const errorEvent = { message: 'Uncaught ReferenceError: foo is not defined' };
    worker.onerror?.(errorEvent);

    await expect(promise).rejects.toThrow('Uncaught ReferenceError: foo is not defined');
    expect(worker.terminated).toBe(true);
    pool.destroy();
  });

  it('handles non-standard errors (string, empty object, null) with fallback "Worker error"', async () => {
    const pool = new WorkerPool('dummy.js', 'test-pool', 1);

    // Test with plain string
    const p1 = pool.run({ id: 'str', type: 'test' });
    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    let worker = allSlots[0].worker;
    worker.onerror?.('something broke');
    await expect(p1).rejects.toThrow('Worker error');

    // Test with empty object
    worker = allSlots[0].worker;
    const p2 = pool.run({ id: 'obj', type: 'test' });
    worker.onerror?.({});
    await expect(p2).rejects.toThrow('Worker error');

    // Test with null
    worker = allSlots[0].worker;
    const p3 = pool.run({ id: 'null', type: 'test' });
    worker.onerror?.(null);
    await expect(p3).rejects.toThrow('Worker error');

    pool.destroy();
  });

  it('recovers cleanly and executes subsequent queued jobs after worker crash', async () => {
    const pool = new WorkerPool('dummy.js', 'test-pool', 1);

    // Run job 1 (will crash)
    const p1 = pool.run({ id: '1', type: 'crash' });
    // Queue job 2 while job 1 is running
    const p2 = pool.run({ id: '2', type: 'queued' });

    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    const initialWorker = allSlots[0].worker;

    // Crash the active worker
    initialWorker.onerror?.(new Error('Crash in job 1'));

    // Job 1 must reject immediately
    await expect(p1).rejects.toThrow('Crash in job 1');
    expect(initialWorker.terminated).toBe(true);

    // Job 2 should now have been scheduled onto the replacement worker!
    const replacementWorker = allSlots[0].worker;
    expect(replacementWorker).not.toBe(initialWorker);
    expect(replacementWorker.postedMessages.length).toBe(1);
    expect((replacementWorker.postedMessages[0] as { id: string }).id).toBe('2');

    // Resolve job 2 on replacement worker
    replacementWorker.onmessage?.({
      data: { id: '2', ok: true, result: 'job2-success' },
    } as MessageEvent);

    await expect(p2).resolves.toBe('job2-success');
    pool.destroy();
  });

  it('handles multiple concurrent worker crashes in multi-worker pool without leaving callers hanging', async () => {
    const poolSize = 3;
    const pool = new WorkerPool('dummy.js', 'multi-pool', poolSize);

    // Run 3 jobs concurrently to fill all 3 slots
    const p1 = pool.run({ id: 'a', type: 'calc' });
    const p2 = pool.run({ id: 'b', type: 'calc' });
    const p3 = pool.run({ id: 'c', type: 'calc' });

    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    expect(allSlots.length).toBe(3);

    // Find which worker received which job
    const workerA = allSlots.find((s) => s.worker.postedMessages.some((m: unknown) => (m as { id: string }).id === 'a'))!.worker;
    const workerB = allSlots.find((s) => s.worker.postedMessages.some((m: unknown) => (m as { id: string }).id === 'b'))!.worker;
    const workerC = allSlots.find((s) => s.worker.postedMessages.some((m: unknown) => (m as { id: string }).id === 'c'))!.worker;

    expect(workerA).toBeDefined();
    expect(workerB).toBeDefined();
    expect(workerC).toBeDefined();

    // workerA crashes
    workerA.onerror?.(new Error('Crash A'));
    // workerB succeeds
    workerB.onmessage?.({
      data: { id: 'b', ok: true, result: 'res-b' },
    } as MessageEvent);
    // workerC crashes
    workerC.onerror?.(new Error('Crash C'));

    await expect(p1).rejects.toThrow('Crash A');
    await expect(p2).resolves.toBe('res-b');
    await expect(p3).rejects.toThrow('Crash C');

    // Both workerA and workerC must be terminated
    expect(workerA.terminated).toBe(true);
    expect(workerC.terminated).toBe(true);

    // Pool should now have 3 available/idle workers ready for new jobs
    const pNext = pool.run({ id: 'd', type: 'calc' });
    const activeWorker = allSlots.find((s) => s.worker.postedMessages.some((m: unknown) => (m as { id: string }).id === 'd'))?.worker;
    expect(activeWorker).toBeDefined();

    activeWorker?.onmessage?.({
      data: { id: 'd', ok: true, result: 'res-d' },
    } as MessageEvent);

    await expect(pNext).resolves.toBe('res-d');
    pool.destroy();
  });

  it('handles unsolicited onerror (when slot.job is undefined) without throwing unhandled error', async () => {
    const pool = new WorkerPool('dummy.js', 'test-pool', 1);
    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    const worker = allSlots[0].worker;

    // Trigger onerror when no job is currently assigned
    expect(() => {
      worker.onerror?.(new Error('Spontaneous worker glitch'));
    }).not.toThrow();

    expect(worker.terminated).toBe(true);

    // Pool should still be operational
    const newWorker = allSlots[0].worker;
    expect(newWorker).not.toBe(worker);

    const p = pool.run({ id: 'after-glitch', type: 'run' });
    newWorker.onmessage?.({
      data: { id: 'after-glitch', ok: true, result: 'ok' },
    } as MessageEvent);

    await expect(p).resolves.toBe('ok');
    pool.destroy();
  });

  it('never leaves caller hanging (empirical timeout oracle)', async () => {
    const pool = new WorkerPool('dummy.js', 'test-pool', 1);
    const runPromise = pool.run({ id: 'hang-test', type: 'test' });

    const allSlots = (pool as unknown as { all: { worker: MockWorker }[] }).all;
    const worker = allSlots[0].worker;

    // Trigger error
    worker.onerror?.(new Error('Sudden crash'));

    // Race against a timeout oracle: if promise does not settle within 100ms, fail
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT: Caller hung indefinitely')), 100)
    );

    await expect(Promise.race([runPromise, timeout])).rejects.toThrow('Sudden crash');
    pool.destroy();
  });
});
