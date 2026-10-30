import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { toExportHeader, toScorecardDocument } from '@/lib/export/context';
import { buildIndividualScorecardsPdf } from '@/lib/export/pdf';

export const runtime = 'nodejs';

export async function GET() {
  await requireAdmin();
  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const cards = await getAllScorecards(context);
  if (cards.length === 0) {
    return NextResponse.json({ error: 'No hay participantes activos' }, { status: 409 });
  }

  try {
    const pdf = await buildIndividualScorecardsPdf({
      header: toExportHeader(context),
      cards: cards.map(toScorecardDocument),
      distances: context.distances,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="tarjetas-individuales.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el documento' }, { status: 500 });
  }
}
