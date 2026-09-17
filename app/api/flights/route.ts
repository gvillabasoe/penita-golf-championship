import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { getCompetition, getFlights } from '@/lib/data/queries';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const flights = await getFlights(context);
  return NextResponse.json({ flights }, { headers: { 'Cache-Control': 'no-store' } });
}
