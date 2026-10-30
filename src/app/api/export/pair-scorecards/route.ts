import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import { getAllScorecards, getCompetition, getPairCompetition } from '@/lib/data/queries';
import { toExportHeader, toPairScorecardDocuments } from '@/lib/export/context';
import { buildPairScorecardsPdf } from '@/lib/export/pdf';

export const runtime = 'nodejs';

export async function GET() {
  await requireAdmin();
  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });
  if (!context.pairModeEnabled) {
    return NextResponse.json({ error: 'El modo parejas no esta activo' }, { status: 409 });
  }

  const cards = await getAllScorecards(context);
  const pairView = await getPairCompetition(context, cards);
  if (pairView.pairs.length === 0) {
    return NextResponse.json({ error: 'Todavia no hay parejas sorteadas' }, { status: 409 });
  }

  try {
    const pdf = await buildPairScorecardsPdf({
      header: toExportHeader(context),
      pairs: toPairScorecardDocuments(pairView.pairs, cards),
      distances: context.distances,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="tarjetas-parejas.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el documento' }, { status: 500 });
  }
}
