'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Refresco periodico durante la revelacion.
 *
 * Sin WebSockets a proposito: la seccion 49 dice que no se dependa de ellos si
 * no son estrictamente necesarios. Para trece moviles mirando una pantalla
 * durante diez minutos, un refresco cada cuatro segundos sobra.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
