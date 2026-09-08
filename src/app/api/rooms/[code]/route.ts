import { NextRequest } from 'next/server';
import { attach, detach, heartbeat, joinRoom, sendToPeer } from '@/lib/server/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** Realtime event stream for one player (SSE) */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401 });
  }

  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const res = attach(code, token, ctrl);
      if (!res.ok) {
        try {
          ctrl.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ t: 'left', reason: 'invalid' })}\n\n`));
          ctrl.close();
        } catch { /* ignore */ }
        return;
      }
      const hb = setInterval(() => {
        if (closed) return;
        heartbeat(code.toUpperCase());
      }, 12000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(hb);
        detach(code, token);
        try {
          ctrl.close();
        } catch { /* already closed */ }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** join a room, or send a message to the peer */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  let body: { action?: string; token?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Bad JSON' }, { status: 400 });
  }

  if (body.action === 'join') {
    const res = joinRoom(code);
    if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: 404 });
    return Response.json({ ok: true, token: res.token, role: 'guest', code: code.toUpperCase() });
  }

  if (body.action === 'send') {
    if (!body.token) return Response.json({ ok: false, error: 'Missing token' }, { status: 401 });
    const raw = JSON.stringify(body.payload ?? null);
    if (raw.length > 8000) return Response.json({ ok: false, error: 'Payload too large' }, { status: 413 });
    const res = sendToPeer(code, body.token, body.payload);
    if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: 404 });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
