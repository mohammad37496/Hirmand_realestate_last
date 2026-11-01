/** Identifies the newest request in a UI flow and makes older responses inert. */
export class LatestRequestSequence {
  private current = 0;

  next() {
    this.current += 1;
    return this.current;
  }

  isCurrent(requestId: number) {
    return requestId === this.current;
  }

  invalidate(requestId?: number) {
    if (requestId == null || this.isCurrent(requestId)) this.current += 1;
  }
}
