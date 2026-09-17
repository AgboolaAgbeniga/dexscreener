/**
 * Lightweight Asynchronous Concurrency Queue
 * Enforces maximum concurrent workers and an optional inter-request delay
 * to protect upstream rate limits (e.g. GoPlus free-tier quotas).
 */
class AsyncQueue {
  constructor({ concurrency = 4, intervalMs = 200 } = {}) {
    this.concurrency = concurrency;
    this.intervalMs = intervalMs;
    this.queue = [];
    this.activeWorkers = 0;
    this.lastExecTime = 0;
  }

  add(asyncFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ asyncFn, resolve, reject });
      this._processNext();
    });
  }

  async _processNext() {
    if (this.activeWorkers >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.activeWorkers++;
    const { asyncFn, resolve, reject } = this.queue.shift();

    const now = Date.now();
    const wait = Math.max(0, this.intervalMs - (now - this.lastExecTime));
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }
    this.lastExecTime = Date.now();

    try {
      const result = await asyncFn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.activeWorkers--;
      this._processNext();
    }
  }

  get size() {
    return this.queue.length;
  }
}

module.exports = AsyncQueue;
