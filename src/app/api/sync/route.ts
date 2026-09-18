import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/server';
import { clearHole, saveHole } from '@/lib/actions/scorecard';
import { getCompetition } from '@/lib/data/queries';

/**
 * Sincronizacion de la cola offline.
 *
 * Recibe un lote y devuelve un veredicto por operacion, para que el movil sepa
 * exactamente que retirar de su cola y que dejar para resolver. Es idempotente:
 * reenviar el mismo lote no duplica nada.
 *
 * Admite dos operaciones: WRITE (apuntar golpes o raya) y CLEAR (dejar el hoyo
 * vacio). Sin el campo `operation` se asume WRITE, para que una cola guardada por
 * la version 1.1 siga subiendo sin tocar nada en el movil.
 *
 * La respuesta lleva la generacion de resultados vigente. Es lo que permite al
 * movil descubrir que el administrador ha vaciado las tarjetas y anular sus
 * operaciones pendientes en lugar de reintentarlas para siempre.
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

  const context = await getCompetition();
  const scoreGeneration = context?.scoreGeneration ?? 0;

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
      operation?: unknown;
      scoreGeneration?: unknown;
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

    const operation = mutation.operation === 'CLEAR' ? 'CLEAR' : 'WRITE';
    const mutationGeneration =
      typeof mutation.scoreGeneration === 'number' ? mutation.scoreGeneration : undefined;

    const result =
      operation === 'CLEAR'
        ? await clearHole({
            clientMutationId: mutation.clientMutationId,
            clientId: mutation.clientId,
            holeNumber: mutation.holeNumber,
            baseVersion: mutation.baseVersion,
            scoreGeneration: mutationGeneration,
          })
        : await saveHole({
            clientMutationId: mutation.clientMutationId,
            clientId: mutation.clientId,
            holeNumber: mutation.holeNumber,
            grossStrokes: typeof mutation.grossStrokes === 'number' ? mutation.grossStrokes : null,
            isPickup: mutation.isPickup,
            baseVersion: mutation.baseVersion,
            scoreGeneration: mutationGeneration,
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
    { outcomes, scoreGeneration },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
