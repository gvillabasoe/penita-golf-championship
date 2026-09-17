import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import { getCompetition, getRanking } from '@/lib/data/queries';
import { buildLeaderboardPdf } from '@/lib/export/pdf';
import { toExportHeader, toExportRows } from '@/lib/export/context';
import { ExportNotAllowedError } from '@/lib/export/guards';

export const runtime = 'nodejs';

/**
 * Clasificacion provisional. Solo administrador, y el documento sale marcado
 * como provisional en su propia cabecera, no como opcion desactivable.
 */
export async function GET() {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const { rows } = await getRanking(context);

  try {
    const pdf = await buildLeaderboardPdf({
      header: toExportHeader(context),
      rows: toExportRows(rows),
      request: {
        kind: 'LEADERBOARD_PROVISIONAL',
        role: admin.role,
        classificationStatus: context.classificationStatus,
      },
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="clasificacion-provisional.pdf"',
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
