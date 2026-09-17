import { NextResponse } from 'next/server';

import { diagnose } from '@/lib/data/health';

/** Runtime Node: consulta la base de datos. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Diagnostico de la instalacion.
 *
 * Publico a proposito: se necesita justo cuando la autenticacion no funciona.
 * No devuelve mensajes de la base de datos, ni cadenas de conexion, ni trazas:
 * solo booleanos, recuentos y el siguiente paso.
 */
export async function GET() {
  const diagnosis = await diagnose();
  return NextResponse.json(diagnosis, {
    status: diagnosis.ready ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
