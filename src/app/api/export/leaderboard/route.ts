import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { getCompetition, getRanking } from '@/lib/data/queries';
import { buildLeaderboardPdf } from '@/lib/export/pdf';
import { buildLeaderboardSvg, rasterizeSvgToPng } from '@/lib/export/svg';
import { toExportHeader, toExportRows } from '@/lib/export/context';
import { ExportNotAllowedError } from '@/lib/export/guards';

/** Runtime Node: pdf-lib y sharp no funcionan en edge. */
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const format = new URL(request.url).searchParams.get('format') ?? 'pdf';
  const { rows } = await getRanking(context);

  const payload = {
    header: toExportHeader(context),
    rows: toExportRows(rows),
    request: {
      kind: 'LEADERBOARD_FINAL' as const,
      role: user.role,
      classificationStatus: context.classificationStatus,
    },
  };

  try {
    if (format === 'svg') {
      const svg = buildLeaderboardSvg(payload);
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Disposition': 'attachment; filename="clasificacion.svg"',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'png') {
      const png = await rasterizeSvgToPng(buildLeaderboardSvg(payload));
      return new NextResponse(Buffer.from(png), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': 'attachment; filename="clasificacion.png"',
          'Cache-Control': 'no-store',
        },
      });
    }

    const pdf = await buildLeaderboardPdf(payload);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="clasificacion.pdf"',
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
