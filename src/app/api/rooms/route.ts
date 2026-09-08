import { NextResponse } from 'next/server';
import { createRoom } from '@/lib/server/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const { code, token } = createRoom();
  return NextResponse.json({ code, token, role: 'host' });
}
