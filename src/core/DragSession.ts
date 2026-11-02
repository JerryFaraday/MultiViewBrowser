/** Only the trusted app toolbar may begin a window exchange. Remote pages supply no source ID. */
export class DragSession {
  private source: string | null = null;
  private expires = 0;
  begin(id: string, now = Date.now()) {
    this.source = id;
    this.expires = now + 60000;
  }
  finish(now = Date.now()) {
    this.expires = Math.min(this.expires, now + 250);
  }
  take(target: string, now = Date.now()) {
    const source = this.source;
    this.source = null;
    return source && source !== target && now <= this.expires ? source : null;
  }
}
