import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import {
  getAllScorecards,
  getCompetition,
  getFlights,
  getPairCompetition,
  getRanking,
} from '@/lib/data/queries';
import {
  toExportHeader,
  toExportRows,
  toFlightDrawDocuments,
  toPairExportRows,
  toPairScorecardDocuments,
  toScorecardDocument,
} from '@/lib/export/context';
import { ExportNotAllowedError } from '@/lib/export/guards';
import { buildCompletePdf } from '@/lib/export/pdf';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const [cards, flights, ranking] = await Promise.all([
    getAllScorecards(context),
    getFlights(context),
    getRanking(context),
  ]);
  if (cards.length === 0) {
    return NextResponse.json({ error: 'No hay participantes activos' }, { status: 409 });
  }

  const pairView = context.pairModeEnabled
    ? await getPairCompetition(context, cards)
    : { pairs: [], ranking: [], unpaired: [] };
  const confirmedFlights =
    context.flightsConfirmedAt === null
      ? []
      : flights.filter((flight) => flight.status === 'CONFIRMED');
  const isPublished = context.classificationStatus === 'PUBLISHED';

  try {
    const pdf = await buildCompletePdf({
      header: toExportHeader(context),
      request: {
        kind: isPublished ? 'LEADERBOARD_FINAL' : 'LEADERBOARD_PROVISIONAL',
        role: admin.role,
        classificationStatus: context.classificationStatus,
      },
      individualRows: toExportRows(ranking.rows),
      individualCards: cards.map(toScorecardDocument),
      flights: toFlightDrawDocuments(confirmedFlights),
      flightDrawSeed: context.flightDrawSeed,
      pairRows: toPairExportRows(pairView.ranking),
      pairs: toPairScorecardDocuments(pairView.pairs, cards),
      pairScoringMode: context.pairScoringMode,
      pairDrawSeed: context.pairDrawSeed,
      distances: context.distances,
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="dossier-completo${isPublished ? '' : '-provisional'}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ExportNotAllowedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'No se pudo generar el documento' }, { status: 500 });
  }
}
