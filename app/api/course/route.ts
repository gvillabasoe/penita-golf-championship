import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { getCompetition } from '@/lib/data/queries';

/**
 * Datos del campo. Es lo unico que el service worker guarda con revalidacion:
 * par, stroke index y distancias cambian cada varios anos.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  return NextResponse.json({
    teeName: context.snapshot.teeName,
    category: context.snapshot.category,
    slopeRating: context.snapshot.slopeRating,
    courseRatingTenths: context.snapshot.courseRatingTenths,
    parTotal: context.snapshot.parTotal,
    distanceTotal: context.snapshot.distanceTotal,
    holes: context.snapshot.holes,
  });
}
