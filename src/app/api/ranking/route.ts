import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { getCompetition, getRanking } from '@/lib/data/queries';
import { visibleGroupCount } from '@/lib/reveal/controller';

/**
 * Clasificacion segun el estado de la revelacion.
 *
 * Lo importante: el recorte se hace EN EL SERVIDOR. Enviar la clasificacion
 * completa y ocultarla en el cliente filtraria el ganador a cualquiera que
 * abriese las herramientas de desarrollo.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

  const context = await getCompetition();
  if (!context) return NextResponse.json({ error: 'Sin competicion' }, { status: 404 });

  const { rows, order, state } = await getRanking(context);
  const visibleGroups = visibleGroupCount(state, user.role);
  const visibleIndices = new Set(order.slice(0, visibleGroups).flat());

  return NextResponse.json(
    {
      status: state.status,
      revealedCount: state.revealedCount,
      totalGroups: order.length,
      rows: rows.filter((_, index) => visibleIndices.has(index)),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
