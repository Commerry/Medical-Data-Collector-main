export type RetryOperation = {
  idcard: string;
  visitno: number;
  field: string;
  value: string | number;
  pcucode: string;
};

export class SyncService {
  private queue: RetryOperation[] = [];
  private retryDelay = 5000;

  enqueue(operation: RetryOperation) {
    this.queue.push(operation);
  }

  drain() {
    const pending = [...this.queue];
    this.queue = [];
    return pending;
  }

  get size() {
    return this.queue.length;
  }

  get delay() {
    return this.retryDelay;
  }
}
