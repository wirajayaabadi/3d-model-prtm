// Antrean prioritas kejadian: urut waktu, lalu nomor urut, sehingga urutan deterministik.
export class EventQueue {
  constructor() {
    this.heap = [];
    this.seq = 0;
  }
  get size() {
    return this.heap.length;
  }
  schedule(time, type, payload = {}) {
    const ev = { time, seq: this.seq++, type, payload, cancelled: false };
    this.push(ev);
    return ev;
  }
  cancel(ev) {
    if (ev) ev.cancelled = true;
  }
  peek() {
    this.dropCancelled();
    return this.heap[0] || null;
  }
  pop() {
    this.dropCancelled();
    if (!this.heap.length) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }
  dropCancelled() {
    while (this.heap.length && this.heap[0].cancelled) {
      const last = this.heap.pop();
      if (this.heap.length) {
        this.heap[0] = last;
        this.siftDown(0);
      }
    }
  }
  clear() {
    this.heap = [];
  }
  less(a, b) {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }
  push(ev) {
    this.heap.push(ev);
    let i = this.heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(this.heap[i], this.heap[p])) {
        [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
        i = p;
      } else break;
    }
  }
  siftDown(i) {
    const n = this.heap.length;
    for (;;) {
      let m = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.less(this.heap[l], this.heap[m])) m = l;
      if (r < n && this.less(this.heap[r], this.heap[m])) m = r;
      if (m === i) return;
      [this.heap[i], this.heap[m]] = [this.heap[m], this.heap[i]];
      i = m;
    }
  }
}
