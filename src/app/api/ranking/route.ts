import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { getCompetition, getRanking } from '@/lib/data/queries';

/**
 * Clasificacion segun el interruptor Provisional / Oficial.
 *
 * El recorte se hace en el servidor. Mientras sea provisional, un jugador no
 * recibe nombres, posiciones ni puntos de la clasificacion completa; el admin
 * si puede revisarla. Cuando es oficial se devuelve completa a todos.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const { rows } = await getRanking(context);
  const visible = user.role === 'ADMIN' || context.classificationStatus === 'PUBLISHED';

  return NextResponse.json(
    {
      status: context.classificationStatus,
      rows: visible ? rows : [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
