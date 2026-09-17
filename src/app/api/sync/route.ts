import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { saveHole } from '@/lib/actions/scorecard';

/**
 * Sincronizacion de la cola offline.
 *
 * Recibe un lote y devuelve un veredicto por operacion, para que el movil sepa
 * exactamente que retirar de su cola y que dejar para resolver. Es idempotente:
 * reenviar el mismo lote no duplica nada.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo no valido' }, { status: 400 });
  }

  const mutations = (body as { mutations?: unknown }).mutations;
  if (!Array.isArray(mutations)) {
    return NextResponse.json({ error: 'Falta el lote de operaciones' }, { status: 400 });
  }
  if (mutations.length > 20) {
    return NextResponse.json({ error: 'Lote demasiado grande' }, { status: 413 });
  }

  const outcomes: Array<{ clientMutationId: string; status: string; error?: string }> = [];

  // En orden estricto: una correccion nunca debe aplicarse antes del valor que
  // corrige.
  for (const raw of mutations) {
    const mutation = raw as {
      clientMutationId?: unknown;
      clientId?: unknown;
      holeNumber?: unknown;
      grossStrokes?: unknown;
      isPickup?: unknown;
      baseVersion?: unknown;
    };

    if (
      typeof mutation.clientMutationId !== 'string' ||
      typeof mutation.clientId !== 'string' ||
      typeof mutation.holeNumber !== 'number' ||
      typeof mutation.isPickup !== 'boolean' ||
      typeof mutation.baseVersion !== 'number'
    ) {
      outcomes.push({ clientMutationId: String(mutation.clientMutationId), status: 'REJECTED', error: 'Operacion mal formada' });
      continue;
    }

    const result = await saveHole({
      clientMutationId: mutation.clientMutationId,
      clientId: mutation.clientId,
      holeNumber: mutation.holeNumber,
      grossStrokes: typeof mutation.grossStrokes === 'number' ? mutation.grossStrokes : null,
      isPickup: mutation.isPickup,
      baseVersion: mutation.baseVersion,
    });

    outcomes.push(
      result.ok
        ? { clientMutationId: mutation.clientMutationId, status: 'APPLIED' }
        : {
            clientMutationId: mutation.clientMutationId,
            status: result.kind ?? 'REJECTED',
            error: result.error,
          },
    );
  }

  return NextResponse.json(
    { outcomes },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
