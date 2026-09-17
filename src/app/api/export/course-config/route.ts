import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import { getCompetition } from '@/lib/data/queries';

export const runtime = 'nodejs';

/** Configuracion del campo en JSON, con su procedencia. Solo administrador. */
export async function GET() {
  await requireAdmin();
  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const payload = {
    club: { code: '4401', name: 'Club de Golf Ulzama' },
    route: 'Ulzama',
    teeName: context.snapshot.teeName,
    category: context.snapshot.category,
    courseRating: context.snapshot.courseRatingTenths / 10,
    slopeRating: context.snapshot.slopeRating,
    parTotal: context.snapshot.parTotal,
    distanceTotal: context.snapshot.distanceTotal,
    ratingDate: '2024-07',
    source: 'https://rfegolf.es/club/club_de_golf_ulzama?id=211',
    rules: { allowancePercent: context.allowancePercent, ruleVersion: context.ruleVersion },
    holes: context.snapshot.holes,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="configuracion-campo.json"',
      'Cache-Control': 'no-store',
    },
  });
}
