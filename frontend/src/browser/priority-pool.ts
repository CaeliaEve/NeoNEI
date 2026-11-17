type Job<T> = { key: string; priority: number; started: boolean; controller: AbortController; consumers: number;
  load: (signal: AbortSignal) => Promise<T>; promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

/** Shared work belongs to its live consumers, not to the first page that requested it. */
export class PriorityPool<T> {
  private jobs = new Map<string, Job<T>>();
  private active = 0;
  private background = 0;
  private concurrency: number;
  private backgroundLimit: number;
  constructor(concurrency = 3, reservedForeground = 0) {
    if(!Number.isSafeInteger(concurrency)||concurrency<1||!Number.isSafeInteger(reservedForeground)
      ||reservedForeground<0||reservedForeground>=concurrency)throw new Error('Invalid request concurrency');
    this.concurrency = concurrency;this.backgroundLimit=concurrency-reservedForeground;
  }
  run(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, priority = 0): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    let job = this.jobs.get(key);
    if (!job) {
      let resolve!: (value: T) => void, reject!: (error: unknown) => void;
      const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
      job = { key, load, promise, resolve, reject, controller: new AbortController(), consumers: 0, started: false, priority };
      this.jobs.set(key, job);
    }
    job.priority = Math.min(job.priority, priority); job.consumers++;
    const shared = job;
    const result = new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = (action: () => void) => {
        if (finished) return; finished = true; signal?.removeEventListener('abort', abort); shared.consumers--;
        if (!shared.consumers && this.jobs.get(key) === shared) {
          this.jobs.delete(key); shared.controller.abort();
          if (!shared.started) shared.reject(new DOMException('Aborted', 'AbortError'));
        }
        action();
      };
      const abort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
      signal?.addEventListener('abort', abort, { once: true });
      shared.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    });
    this.drain(); return result;
  }
  priority(key:string):number|undefined{return this.jobs.get(key)?.priority;}
  promote(key:string,priority:number):void{
    const job=this.jobs.get(key);if(!job)return;job.priority=Math.min(job.priority,priority);this.drain();
  }
  private drain() {
    while (this.active < this.concurrency) {
      const next = [...this.jobs.values()].filter(job => !job.started&&(job.priority<=0||this.background<this.backgroundLimit)).sort((a, b) => a.priority - b.priority)[0];
      if (!next) return;
      const background=next.priority>0;
      next.started = true; this.active++;if(background)this.background++;
      try {
        Promise.resolve(next.load(next.controller.signal)).then(next.resolve, next.reject).finally(() => {
          if (this.jobs.get(next.key) === next) this.jobs.delete(next.key);
          this.active--;if(background)this.background--;this.drain();
        });
      } catch (error) { next.reject(error); this.jobs.delete(next.key); this.active--;if(background)this.background--; }
    }
  }
  close() { for (const job of this.jobs.values()) { job.controller.abort(); job.reject(new DOMException('Aborted', 'AbortError')); } this.jobs.clear(); }
}
