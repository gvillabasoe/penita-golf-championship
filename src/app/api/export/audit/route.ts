import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import { getAuditLog, getCompetition } from '@/lib/data/queries';

export const runtime = 'nodejs';

/** Historial en CSV: se abre en Excel y se archiva. Solo administrador. */
export async function GET() {
  await requireAdmin();
  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const entries = await getAuditLog(context, 5000);

  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = [
    ['fecha', 'actor', 'accion', 'entidad', 'id', 'motivo'].join(';'),
    ...entries.map((entry) =>
      [
        entry.createdAt.toISOString(),
        entry.actor?.displayName ?? 'sistema',
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.reason ?? '',
      ]
        .map(escape)
        .join(';'),
    ),
  ];

  // BOM para que Excel en Windows lea las tildes bien.
  return new NextResponse(`\ufeff${lines.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="historial.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
