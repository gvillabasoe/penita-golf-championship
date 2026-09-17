import { NextResponse } from 'next/server';

import { getLoginRoster } from '@/lib/data/queries';

/** Lista para el selector del login. Publica, y sin ningun dato sensible. */
export async function GET() {
  const players = await getLoginRoster();
  return NextResponse.json(
    { players },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
