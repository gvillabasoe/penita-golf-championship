import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { buildScorecardPdf } from '@/lib/export/pdf';
import { toExportHeader, toScorecardPlayer } from '@/lib/export/context';
import { ExportNotAllowedError } from '@/lib/export/guards';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const { id } = await params;
  const cards = await getAllScorecards(context);
  const card = cards.find((item) => item.scorecardId === id);
  if (!card) return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 });

  try {
    const pdf = await buildScorecardPdf({
      header: toExportHeader(context),
      player: toScorecardPlayer(card),
      results: card.results,
      distances: context.distances,
      totals: card.totals,
      request: {
        kind: 'SCORECARD',
        role: user.role,
        classificationStatus: context.classificationStatus,
        requesterPlayerId: user.competitionPlayerId ?? undefined,
        targetPlayerId: card.competitionPlayerId,
        requesterFlightId: user.flightId,
        targetFlightId: card.flightId,
      },
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="tarjeta-${id}.pdf"`,
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
