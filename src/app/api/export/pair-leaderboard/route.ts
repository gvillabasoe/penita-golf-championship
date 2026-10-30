import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import { getAllScorecards, getCompetition, getPairCompetition } from '@/lib/data/queries';
import { toExportHeader, toPairExportRows } from '@/lib/export/context';
import { ExportNotAllowedError } from '@/lib/export/guards';
import { buildPairLeaderboardPdf } from '@/lib/export/pdf';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
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

  const isPublished = context.classificationStatus === 'PUBLISHED';

  try {
    const pdf = await buildPairLeaderboardPdf({
      header: toExportHeader(context),
      rows: toPairExportRows(pairView.ranking),
      scoringMode: context.pairScoringMode,
      pairDrawSeed: context.pairDrawSeed,
      request: {
        kind: isPublished ? 'LEADERBOARD_FINAL' : 'LEADERBOARD_PROVISIONAL',
        role: admin.role,
        classificationStatus: context.classificationStatus,
      },
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="clasificacion-parejas${isPublished ? '' : '-provisional'}.pdf"`,
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
