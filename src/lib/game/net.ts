// ============================================================
// Pen Fight — realtime client.
// Transport: SSE (server → client) + POST (client → server),
// exposing WebSocket-style semantics: paired / msg / left.
// ============================================================

export type NetRole = 'host' | 'guest';

export interface NetEvents {
  onMessage: (payload: Record<string, unknown>) => void;
  onPaired: () => void;
  onPeerLeft: () => void;
  onClosed: () => void;
}

export class NetClient {
  role: NetRole = 'host';
  code = '';
  private token = '';
  private es: EventSource | null = null;
  private events: NetEvents;
  private closed = false;
  private sendQueue: Promise<void> = Promise.resolve();

  constructor(events: NetEvents) {
    this.events = events;
  }

  async create(): Promise<string> {
    const res = await fetch('/api/rooms', { method: 'POST' });
    if (!res.ok) throw new Error('Could not create room');
    const data = (await res.json()) as { code: string; token: string };
    this.code = data.code;
    this.token = data.token;
    this.role = 'host';
    this.openStream();
    return data.code;
  }

  async join(code: string): Promise<void> {
    const c = code.trim().toUpperCase();
    if (c.length !== 4) throw new Error('Enter the 4-letter room code');
    const res = await fetch(`/api/rooms/${c}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join' }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string; token?: string };
    if (!res.ok || !data.ok || !data.token) {
      throw new Error(data.error ?? 'Could not join room');
    }
    this.code = c;
    this.token = data.token;
    this.role = 'guest';
    this.openStream();
  }

  private openStream(): void {
    if (this.closed) return;
    this.es = new EventSource(`/api/rooms/${this.code}?token=${this.token}`);
    this.es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { t: string; p?: Record<string, unknown> };
        if (msg.t === 'paired') this.events.onPaired();
        else if (msg.t === 'left') this.events.onPeerLeft();
        else if (msg.t === 'msg' && msg.p) this.events.onMessage(msg.p);
      } catch { /* ignore malformed */ }
    };
    this.es.onerror = () => {
      // EventSource auto-reconnects; surface nothing unless fully closed
      if (this.closed) this.events.onClosed();
    };
  }

  /** fire-and-forget ordered send */
  send(payload: Record<string, unknown>): void {
    if (this.closed || !this.code) return;
    const body = JSON.stringify({ action: 'send', token: this.token, payload });
    this.sendQueue = this.sendQueue.then(async () => {
      try {
        await fetch(`/api/rooms/${this.code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        });
      } catch { /* transient */ }
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.es?.close();
    } catch { /* ignore */ }
    this.es = null;
  }
}
