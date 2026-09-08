// ============================================================
// Pen Fight — realtime room store (server-side, in-memory).
// Rooms pair two players; messages are relayed peer↔peer over
// a Server-Sent-Events stream + POST sends, with WebSocket-style
// semantic messages: paired / msg / left.
// ============================================================

export type Role = 'host' | 'guest';

interface Peer {
  token: string;
  role: Role;
  ctrl: ReadableStreamDefaultController<Uint8Array> | null;
  encoder: TextEncoder;
  detachTimer: ReturnType<typeof setTimeout> | null;
  connected: boolean;
}

interface Room {
  code: string;
  host: Peer;
  guest: Peer | null;
  createdAt: number;
  lastActivity: number;
}

interface RoomsState {
  rooms: Map<string, Room>;
}

const g = globalThis as unknown as { __penFightRooms?: RoomsState };
if (!g.__penFightRooms) {
  g.__penFightRooms = { rooms: new Map() };
}
const state = g.__penFightRooms;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 45 * 60 * 1000;
const REATTACH_GRACE = 5000;

function genCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function genToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function sweep(): void {
  const now = Date.now();
  for (const [code, room] of state.rooms) {
    if (now - room.lastActivity > ROOM_TTL) {
      closeRoom(code, 'expired');
    }
  }
}

function pushTo(peer: Peer | null, payload: unknown): boolean {
  if (!peer || !peer.ctrl || !peer.connected) return false;
  try {
    peer.ctrl.enqueue(peer.encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    return true;
  } catch {
    return false;
  }
}

function touch(room: Room): void {
  room.lastActivity = Date.now();
}

export function createRoom(): { code: string; token: string } {
  sweep();
  let code = genCode();
  while (state.rooms.has(code)) code = genCode();
  const room: Room = {
    code,
    host: { token: genToken(), role: 'host', ctrl: null, encoder: new TextEncoder(), detachTimer: null, connected: false },
    guest: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  state.rooms.set(code, room);
  return { code, token: room.host.token };
}

export function joinRoom(code: string): { ok: true; token: string } | { ok: false; error: string } {
  sweep();
  const room = state.rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: 'Room not found. Check the code.' };
  if (room.guest) return { ok: false, error: 'Room is full.' };
  const guest: Peer = { token: genToken(), role: 'guest', ctrl: null, encoder: new TextEncoder(), detachTimer: null, connected: false };
  room.guest = guest;
  touch(room);
  // tell the host someone joined (they may already be listening)
  pushTo(room.host, { t: 'paired' });
  return { ok: true, token: guest.token };
}

function findPeer(room: Room, token: string): Peer | null {
  if (room.host.token === token) return room.host;
  if (room.guest && room.guest.token === token) return room.guest;
  return null;
}

export function otherPeer(room: Room, peer: Peer): Peer | null {
  return peer.role === 'host' ? room.guest : room.host;
}

export function attach(
  code: string,
  token: string,
  ctrl: ReadableStreamDefaultController<Uint8Array>
): { ok: boolean; peerRole?: Role } {
  const room = state.rooms.get(code.toUpperCase());
  if (!room) return { ok: false };
  const peer = findPeer(room, token);
  if (!peer) return { ok: false };
  if (peer.detachTimer) {
    clearTimeout(peer.detachTimer);
    peer.detachTimer = null;
  }
  peer.ctrl = ctrl;
  peer.connected = true;
  touch(room);
  // replay pairing so a reconnected client can resync
  if (room.guest && room.guest.connected) {
    pushTo(room.host, { t: 'paired' });
    pushTo(room.guest, { t: 'paired' });
  }
  return { ok: true, peerRole: peer.role };
}

export function heartbeat(code: string): void {
  const room = state.rooms.get(code.toUpperCase());
  if (!room) return;
  const comment = new TextEncoder().encode(': ping\n\n');
  try {
    room.host.ctrl?.enqueue(comment);
  } catch { /* closed */ }
  try {
    room.guest?.ctrl?.enqueue(comment);
  } catch { /* closed */ }
}

export function detach(code: string, token: string): void {
  const room = state.rooms.get(code.toUpperCase());
  if (!room) return;
  const peer = findPeer(room, token);
  if (!peer) return;
  peer.connected = false;
  peer.ctrl = null;
  if (peer.detachTimer) clearTimeout(peer.detachTimer);
  peer.detachTimer = setTimeout(() => {
    const r = state.rooms.get(code.toUpperCase());
    if (!r) return;
    const other = otherPeer(r, peer);
    if (!peer.connected) {
      pushTo(other, { t: 'left' });
      if (peer.role === 'host') closeRoom(code, 'host-left');
    }
  }, REATTACH_GRACE);
}

export function sendToPeer(code: string, token: string, payload: unknown): { ok: boolean; error?: string } {
  const room = state.rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: 'Room gone' };
  const peer = findPeer(room, token);
  if (!peer) return { ok: false, error: 'Bad token' };
  touch(room);
  const other = otherPeer(room, peer);
  pushTo(other, { t: 'msg', p: payload });
  return { ok: true };
}

export function closeRoom(code: string, reason: string): void {
  const room = state.rooms.get(code.toUpperCase());
  if (!room) return;
  const payload = { t: 'left', reason };
  pushTo(room.host, payload);
  if (room.guest) pushTo(room.guest, payload);
  try {
    room.host.ctrl?.close();
  } catch { /* ignore */ }
  try {
    room.guest?.ctrl?.close();
  } catch { /* ignore */ }
  if (room.host.detachTimer) clearTimeout(room.host.detachTimer);
  if (room.guest?.detachTimer) clearTimeout(room.guest.detachTimer);
  state.rooms.delete(code.toUpperCase());
}
