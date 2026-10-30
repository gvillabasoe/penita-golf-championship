import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/server';
import { getCompetition, getFlights } from '@/lib/data/queries';
import { toExportHeader, toFlightDrawDocuments } from '@/lib/export/context';
import { buildFlightDrawPdf } from '@/lib/export/pdf';

export const runtime = 'nodejs';

export async function GET() {
  await requireAdmin();
  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const flights = await getFlights(context);
  const confirmedFlights = flights.filter((flight) => flight.status === 'CONFIRMED');
  if (context.flightsConfirmedAt === null || confirmedFlights.length === 0) {
    return NextResponse.json(
      { error: 'Confirma los partidos antes de exportar el sorteo' },
      { status: 409 },
    );
  }

  try {
    const pdf = await buildFlightDrawPdf({
      header: toExportHeader(context),
      flights: toFlightDrawDocuments(confirmedFlights),
      seed: context.flightDrawSeed,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="sorteo-partidos.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el documento' }, { status: 500 });
  }
}
