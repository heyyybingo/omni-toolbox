export type WorkerJobMessage = {
  id: string;
  type: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WorkerJobResult<T = unknown> = {
  id: string;
  ok: boolean;
  result?: T;
  error?: string;
};

export class WorkerPool {
  readonly size: number;
  private idle: { worker: Worker; busy: boolean; job?: Job }[] = [];
  private all: { worker: Worker; busy: boolean; job?: Job }[] = [];
  private queue: Job[] = [];
  private destroyed = false;

  constructor(
    private workerUrl: URL | string,
    private name = 'pool',
    size?: number
  ) {
    const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    this.size = Math.max(1, Math.min(size ?? hw, 4));
    for (let i = 0; i < this.size; i++) {
      const slot = { worker: new Worker(workerUrl, { type: 'module' }), busy: false, job: undefined as Job | undefined };
      this.bind(slot);
      this.all.push(slot);
      this.idle.push(slot);
    }
  }

  private bind(slot: (typeof this.all)[number]) {
    slot.worker.onmessage = (event: MessageEvent<WorkerJobResult>) => {
      const { ok, result, error } = event.data || {};
      const job = slot.job;
      slot.busy = false;
      slot.job = undefined;
      this.idle.push(slot);
      if (job) {
        if (ok) job.resolve(result);
        else job.reject(new Error(error || 'Worker failed'));
      }
      this.drain();
    };
    slot.worker.onerror = (err) => {
      slot.busy = false;
      try {
        slot.worker.terminate();
      } catch {
        /* ignore */
      }
      slot.worker = new Worker(this.workerUrl, { type: 'module' });
      this.bind(slot);
      this.idle.push(slot);
      this.drain();
      console.error(`[${this.name}] worker error`, err);
    };
  }

  private drain() {
    if (this.destroyed) return;
    while (this.queue.length && this.idle.length) {
      const job = this.queue.shift()!;
      const slot = this.idle.pop()!;
      slot.busy = true;
      slot.job = job;
      slot.worker.postMessage(job.message, job.transfer || []);
    }
  }

  run<T = unknown>(message: WorkerJobMessage, transfer: Transferable[] = []): Promise<T> {
    if (this.destroyed) return Promise.reject(new Error('Pool destroyed'));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        message,
        transfer,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  destroy() {
    this.destroyed = true;
    for (const slot of this.all) {
      try {
        slot.worker.terminate();
      } catch {
        /* ignore */
      }
    }
    this.all = [];
    this.idle = [];
    this.queue = [];
  }
}

type Job = {
  message: WorkerJobMessage;
  transfer: Transferable[];
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};
